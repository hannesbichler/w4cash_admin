const isLocalHost = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const environment = {
  production: false,
  apiBaseUrl: isLocalHost ? 'http://localhost:3001/api' : 'https://172.27.96.1:3001/api',
  authEnabled: !isLocalHost,
  msal: {
    tenantId: isLocalHost ? '' : '6ec83812-2877-420d-92a3-8bb177d78d2e',
    clientId: isLocalHost ? '' : 'b99feb31-dca9-4618-a3c3-a274f202dbe1',
    redirectUri: isLocalHost ? 'http://localhost:4200' : 'https://172.27.96.1:65114',
    scopes: isLocalHost ? [] : ['User.Read']
  }
};
