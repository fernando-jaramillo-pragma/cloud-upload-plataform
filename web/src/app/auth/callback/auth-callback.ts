import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-auth-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="callback-container">
      <div class="callback-card">
        @if (error()) {
          <div class="callback-error">
            <div class="error-icon">!</div>
            <h2>Error al iniciar sesion</h2>
            <p>{{ error() }}</p>
            <button class="retry-btn" (click)="goToLogin()">
              Volver al inicio de sesion
            </button>
          </div>
        } @else {
          <div class="callback-loading">
            <div class="spinner-ring">
              <div></div><div></div><div></div><div></div>
            </div>
            <h2>Verificando sesion...</h2>
            <p>Estamos confirmando tu identidad con Google</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .callback-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
      padding: 1rem;
    }

    .callback-card {
      background: rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 1.5rem;
      padding: 3rem 2.5rem;
      text-align: center;
      max-width: 400px;
      width: 100%;
      color: white;
    }

    .callback-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.25rem;

      h2 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
      }

      p {
        color: rgba(255, 255, 255, 0.6);
        margin: 0;
        font-size: 0.95rem;
      }
    }

    .spinner-ring {
      display: inline-block;
      position: relative;
      width: 60px;
      height: 60px;

      div {
        box-sizing: border-box;
        display: block;
        position: absolute;
        width: 46px;
        height: 46px;
        margin: 7px;
        border: 4px solid transparent;
        border-radius: 50%;
        animation: ring-spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
        border-top-color: #a78bfa;

        &:nth-child(1) { animation-delay: -0.45s; }
        &:nth-child(2) { animation-delay: -0.3s; border-top-color: #818cf8; }
        &:nth-child(3) { animation-delay: -0.15s; border-top-color: #60a5fa; }
        &:nth-child(4) { border-top-color: #34d399; }
      }
    }

    .callback-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;

      h2 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
      }

      p {
        color: rgba(255, 160, 160, 0.9);
        margin: 0;
        font-size: 0.9rem;
      }
    }

    .error-icon {
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.2);
      border: 2px solid rgba(239, 68, 68, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 700;
      color: #f87171;
    }

    .retry-btn {
      margin-top: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, #7c3aed, #4f46e5);
      color: white;
      border: none;
      border-radius: 0.75rem;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(124, 58, 237, 0.4);
      }
    }

    @keyframes ring-spin {
      0%   { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `],
})
export class AuthCallback implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code');
    const errorParam = this.route.snapshot.queryParamMap.get('error');

    if (errorParam) {
      this.error.set('El proveedor de identidad rechazo la solicitud. Intenta nuevamente.');
      return;
    }

    if (!code) {
      this.error.set('No se recibio un codigo de autorizacion valido.');
      return;
    }

    try {
      await this.auth.handleCallback(code);
      await this.router.navigate(['/']);
    } catch (err) {
      console.error('Error en callback de autenticacion:', err);
      this.error.set('Ocurrio un error al verificar tu sesion. Por favor intenta nuevamente.');
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
