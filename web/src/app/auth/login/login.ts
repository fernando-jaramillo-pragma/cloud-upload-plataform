import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly auth = inject(AuthService);
  readonly isLoading = signal(false);

  async onGoogleLogin(): Promise<void> {
    this.isLoading.set(true);
    try {
      await this.auth.login();
    } catch {
      this.isLoading.set(false);
    }
  }
}
