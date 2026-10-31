/**
 * Graph and Power BI error payloads are untrusted tenant-controlled text.
 * Their messages/codes can contain signed download links, bearer credentials,
 * personal information or HTML. Do not put them in Nest exceptions/logs.
 * HTTP status is the only provider value allowed across this boundary.
 */
export function safeMicrosoftApiFailure(status: number): { code: string; message: string } {
  switch (status) {
    case 401: return { code: 'unauthorized', message: 'Microsoft authorization is required again.' };
    case 403: return { code: 'forbidden', message: 'Microsoft denied access to this resource.' };
    case 404: return { code: 'notFound', message: 'Microsoft could not find this resource.' };
    case 429: return { code: 'rateLimited', message: 'Microsoft is rate limiting requests. Try again later.' };
    default: return {
      code: 'upstreamFailure',
      message: 'Microsoft request failed.',
    };
  }
}
