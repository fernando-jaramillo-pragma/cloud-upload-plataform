export const environment = {
  production: true,
  apiUrl: '#{API_URL}#',
  cognito: {
    region: '#{COGNITO_REGION}#',
    userPoolId: '#{COGNITO_USER_POOL_ID}#',
    clientId: '#{COGNITO_CLIENT_ID}#',
    domain: '#{COGNITO_DOMAIN}#',
    redirectUri: '#{APP_REDIRECT_URI}#',
    logoutUri: '#{APP_LOGOUT_URI}#',
    scopes: ['openid', 'email', 'profile'],
  },
};

