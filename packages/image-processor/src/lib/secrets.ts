import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const SECRET_NAME = 'r2-fernando-photos';
const AWS_REGION = 'us-east-1';

export interface R2Credentials {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_PUBLIC_URL: string;
}

// Cache de credenciales para no consultar Secrets Manager en cada invocación
let cachedCredentials: R2Credentials | null = null;

const client = new SecretsManagerClient({ region: AWS_REGION });

/**
 * Obtiene las credenciales de R2 desde AWS Secrets Manager.
 * Las credenciales se cachean para evitar llamadas repetidas.
 */
export async function getR2Credentials(): Promise<R2Credentials> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: SECRET_NAME,
      VersionStage: 'AWSCURRENT',
    }),
  );

  if (!response.SecretString) {
    throw new Error('Secret string is empty');
  }

  const secrets = JSON.parse(response.SecretString);

  cachedCredentials = {
    R2_ACCOUNT_ID: secrets.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: secrets.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: secrets.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: secrets.R2_BUCKET_NAME,
    R2_PUBLIC_URL: secrets.R2_PUBLIC_URL,
  };

  return cachedCredentials;
}
