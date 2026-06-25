export const environment = {
  production: false,
  cognito: {
    region: 'us-east-1',
    userPoolId: 'LOCAL_USER_POOL_ID',
    clientId: 'LOCAL_CLIENT_ID',
    domain: 'https://YOUR_COGNITO_DOMAIN.auth.us-east-1.amazoncognito.com',
    redirectUri: 'http://localhost:4200/auth/callback',
    logoutUri: 'http://localhost:4200/login',
    scopes: ['openid', 'email', 'profile'],
  },
};
