export declare const DISPOSABLE_ACK: string;
export declare function assertDisposableAcceptanceConfig(
  env: Record<string, string | undefined>
): { enabled: false } | { enabled: true; database: string; restrictedRole: 'pmo_app' };
