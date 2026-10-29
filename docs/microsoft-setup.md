# Connecting The EPMO to Microsoft 365

What this gives a customer: documents stored in **their own** SharePoint or
OneDrive, and **their own** Power BI reports rendered inside The EPMO.

The shape of it matters, so it is worth being blunt about:

- The EPMO registers **one** application in **our** Entra ID tenant.
- Each customer's administrator consents to that application **inside their own
  Microsoft tenant**. Consent is per customer and they can revoke it themselves
  at any time, from their own portal, without asking us.
- Files are written to **their** storage and stay there. The EPMO holds a
  pointer — which drive, which item — and a refresh token. There is no copy on
  our servers, no cache, no bucket. Their retention policy, their permissions
  and their legal hold continue to apply because the file never left.
- **Power BI currently uses the Microsoft account connected to the workspace**, not
  the signed-in EPMO member's personal delegated token. Its bearer token must
  not be exposed to ordinary viewers. Therefore Power BI report listings and
  embedded reports are **restricted to EPMO workspace administrators**, and the
  connected account should have the minimum reporting permissions needed.
  Per-user report sharing requires a separately designed OAuth flow.

None of this works until the registration below exists. Until then the
Integrations page says Microsoft is not configured, which is the truth, rather
than offering a button that fails.

---

## 1. Register the application (once, in our tenant)

In the [Entra admin centre](https://entra.microsoft.com) → **Applications** →
**App registrations** → **New registration**:

| Field | Value |
|---|---|
| Name | `The EPMO` |
| Supported account types | **Accounts in any organizational directory (Any Microsoft Entra ID tenant — Multitenant)** |
| Redirect URI | **Web** → `https://pmo.example.com/integrations/microsoft/callback` |

The account type is the one setting that cannot be fixed later without
re-registering. Single-tenant means only *our* staff could ever connect, which
is the opposite of the point.

The redirect URI is on the **web app's** address — the same origin people sign
in at — and must match `MS_REDIRECT_URI` character for character: scheme, host,
path, no trailing slash. Microsoft compares it as a literal string.

It is not the API's address. Only the web app is published through nginx, so a
URI pointing at the API would be registered happily, accepted by Microsoft, and
then 404 in the one browser that mattered.

Add one redirect URI per environment:

```
https://align360.aetherixsystems.com/integrations/microsoft/callback   (prod)
https://dev.3-111-66-127.sslip.io/integrations/microsoft/callback      (dev)
http://localhost:3000/integrations/microsoft/callback                  (local)
```

`http://localhost` is the one address Entra ID allows over plain HTTP, which is
what makes a local end-to-end test possible without tunnelling anything.

## 2. Add a client secret

**Certificates & secrets** → **New client secret**. Copy the **Value**, not the
Secret ID — the value is shown once and never again.

Give it the longest expiry your policy allows and put the date in a calendar.
When a client secret expires every customer's connection stops at once, and the
error Microsoft returns (`invalid_client`) does not say that is why.

## 3. Declare the permissions

**API permissions** → **Add a permission**. All of these are **Delegated**, not
Application: delegated means The EPMO can only ever do what the signed-in
person could already do themselves, so connecting cannot grant anybody access
to a site they could not already open.

**Microsoft Graph**

| Permission | What it is for |
|---|---|
| `offline_access` | the refresh token — without it the connection dies after about an hour |
| `openid`, `profile`, `email` | who connected, to show on the Integrations page |
| `User.Read` | the signed-in account's own OneDrive |
| `Files.ReadWrite.All` | reading and writing documents in the chosen library |
| `Sites.ReadWrite.All` | listing SharePoint sites so a library can be chosen |

**Power BI Service**

| Permission | What it is for |
|---|---|
| `Report.Read.All` | listing and embedding reports |
| `Dataset.Read.All` | the data behind an embedded report |
| `Workspace.Read.All` | listing the workspaces reports live in |

Do **not** press "Grant admin consent" here — that grants it for *our* tenant.
Each customer grants it for theirs, by going through the connect flow.

## 4. Allow Power BI to be embedded

In the customer's tenant, a Power BI administrator must have
**Tenant settings → Developer settings → Embed content in apps** enabled, for
the whole organisation or for a group that includes the people who will view
reports. This is off by default in some tenants and the failure, when it is
off, is an empty frame rather than a message.

## 5. Set the environment variables

On the server, in `.env.prod` (or `.env` locally):

```bash
MS_CLIENT_ID=<Application (client) ID from the overview page>
MS_CLIENT_SECRET=<the secret Value from step 2>
MS_REDIRECT_URI=https://align360.aetherixsystems.com/integrations/microsoft/callback
MS_TOKEN_KEY=$(openssl rand -base64 32)
```

`MS_TOKEN_KEY` encrypts the stored refresh token (AES-256-GCM) so a database
dump is not a set of keys to a customer's SharePoint. **Keep it.** Changing it
leaves every existing connection unreadable and every customer has to connect
again.

`MS_AUTHORITY` is optional. The default, `…/organizations`, admits work and
school accounts only, which is what Power BI requires. Set it to `…/common` to
also allow personal Microsoft accounts — they can use OneDrive but not Power BI.

Then redeploy, so the containers pick the variables up:

```bash
infra/deploy.sh prod
```

`docker-compose.prod.yml` names each variable explicitly. An entry that exists
only in `.env.prod` reaches compose's interpolation and never reaches the
process, which is a quiet way to spend an afternoon.

## 6. What the customer does

1. **Configure → Integrations** → **Connect Microsoft**.
2. They sign in with a Microsoft account from their own organisation and accept
   the consent screen. Some tenants require an administrator for this; if so,
   Microsoft says which permissions need approval and from whom.
3. Back in The EPMO: **Choose where files go** → a SharePoint site → a document
   library. The EPMO creates one folder there, named for the workspace, and a
   folder per project under it on first upload.
4. Optionally **Add Power BI**, which is a second, separate consent. Keeping it
   separate means a customer who only wants document storage is never asked to
   approve access to their reporting.

**Disconnect** deletes our copy of the token and nothing else. Their files stay
exactly where they are, and the document rows keep pointing at them, so
reconnecting restores every link rather than orphaning them.

---

## When it does not work

| What you see | What it usually is |
|---|---|
| "Microsoft is not configured on this server yet" | one of `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI`, `MS_TOKEN_KEY` is empty in the container. Check that the variables are present with a restricted configuration check; **do not print `MS_CLIENT_SECRET` or `MS_TOKEN_KEY` to logs** |
| `AADSTS50011` redirect URI mismatch | the registered URI and `MS_REDIRECT_URI` differ. Compare them character by character; a trailing slash counts |
| `AADSTS65001` consent required | the customer approved Graph but not Power BI, or the other way round. The page offers the missing one |
| `AADSTS7000215` invalid client secret | the Secret **ID** was copied instead of the **Value**, or the secret has expired |
| "The Microsoft connection is no longer valid" | the refresh token was revoked, the password changed, or a conditional-access policy now blocks it. Connect again |
| Power BI frame stays blank | "Embed content in apps" is off in their Power BI tenant settings (step 4) |
| No SharePoint sites listed | the account that connected cannot see any. Graph's site search returns only what that person already has access to |
