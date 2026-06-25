import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CognitoUser {
  sub: string;
  email: string;
  name: string;
  picture: string;
  given_name?: string;
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

const STORAGE_KEYS = {
  accessToken: 'auth_access_token',
  idToken: 'auth_id_token',
  refreshToken: 'auth_refresh_token',
  expiresAt: 'auth_expires_at',
  codeVerifier: 'auth_code_verifier',
} as const;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = environment.cognito;

  private readonly _user = signal<CognitoUser | null>(this.loadUserFromStorage());

  readonly currentUser = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null && this.isTokenValid());

  // ──────────────────────────────────────────────────────────────────────────
  // Estado de la sesion
  // ──────────────────────────────────────────────────────────────────────────

  isAuthenticated(): boolean {
    return this.isTokenValid();
  }

  private isTokenValid(): boolean {
    const expiresAt = localStorage.getItem(STORAGE_KEYS.expiresAt);
    const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken);
    if (!accessToken || !expiresAt) return false;
    return Date.now() < parseInt(expiresAt, 10);
  }

  private loadUserFromStorage(): CognitoUser | null {
    const idToken = localStorage.getItem(STORAGE_KEYS.idToken);
    if (!idToken) return null;
    const expiresAt = localStorage.getItem(STORAGE_KEYS.expiresAt);
    if (!expiresAt || Date.now() >= parseInt(expiresAt, 10)) return null;
    return this.decodeJwt(idToken);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Flujo OAuth PKCE
  // ──────────────────────────────────────────────────────────────────────────

  async login(): Promise<void> {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    localStorage.setItem(STORAGE_KEYS.codeVerifier, codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      identity_provider: 'Google',
    });

    window.location.href = `${this.config.domain}/oauth2/authorize?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<void> {
    const codeVerifier = localStorage.getItem(STORAGE_KEYS.codeVerifier);
    if (!codeVerifier) {
      throw new Error('No se encontro el code_verifier. Intenta iniciar sesion nuevamente.');
    }

    const body = new HttpParams()
      .set('grant_type', 'authorization_code')
      .set('client_id', this.config.clientId)
      .set('code', code)
      .set('redirect_uri', this.config.redirectUri)
      .set('code_verifier', codeVerifier);

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    const tokens = await firstValueFrom(
      this.http.post<TokenResponse>(`${this.config.domain}/oauth2/token`, body.toString(), {
        headers,
      }),
    );

    this.storeTokens(tokens);
    localStorage.removeItem(STORAGE_KEYS.codeVerifier);

    const user = this.decodeJwt(tokens.id_token);
    this._user.set(user);
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEYS.accessToken);
    localStorage.removeItem(STORAGE_KEYS.idToken);
    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    localStorage.removeItem(STORAGE_KEYS.expiresAt);
    localStorage.removeItem(STORAGE_KEYS.codeVerifier);
    this._user.set(null);

    const logoutUrl = `${this.config.domain}/logout?client_id=${this.config.clientId}&logout_uri=${encodeURIComponent(this.config.logoutUri)}`;
    window.location.href = logoutUrl;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Utilidades internas
  // ──────────────────────────────────────────────────────────────────────────

  private storeTokens(tokens: TokenResponse): void {
    const expiresAt = Date.now() + tokens.expires_in * 1000;
    localStorage.setItem(STORAGE_KEYS.accessToken, tokens.access_token);
    localStorage.setItem(STORAGE_KEYS.idToken, tokens.id_token);
    localStorage.setItem(STORAGE_KEYS.refreshToken, tokens.refresh_token);
    localStorage.setItem(STORAGE_KEYS.expiresAt, expiresAt.toString());
  }

  private decodeJwt(token: string): CognitoUser | null {
    try {
      const payload = token.split('.')[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded) as CognitoUser;
    } catch {
      return null;
    }
  }

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
