import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ImageProcessResult, ThumbnailItem } from '@org/models';

const API_URL = 'http://localhost:3000';

type AlertType = 'error' | 'success' | 'deleted';

interface Alert {
  type: AlertType;
  message: string;
}

@Component({
  selector: 'app-upload',
  templateUrl: './upload-image.html',
  styleUrl: './upload-image.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadImage implements OnInit {
  private readonly http = inject(HttpClient);
  private alertTimer: ReturnType<typeof setTimeout> | null = null;

  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly isUploading = signal(false);
  readonly isLoading = signal(false);
  readonly alert = signal<Alert | null>(null);
  readonly recentUploads = signal<ThumbnailItem[]>([]);
  readonly modalImageUrl = signal<string | null>(null);
  readonly deletingKey = signal<string | null>(null);

  ngOnInit(): void {
    this.loadRecentUploads();
  }

  onSelectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.clearAlert();

    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];

    if (!file.type.startsWith('image/')) {
      this.showAlert('error', 'Solo se permiten imágenes');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) {
      this.showAlert('error', 'La imagen no debe exceder 10MB');
      return;
    }

    this.selectedFile.set(file);
    this.isLoading.set(true);

    const reader = new FileReader();
    reader.onload = () => {
      this.previewUrl.set(reader.result as string);
      this.isLoading.set(false);
    };
    reader.readAsDataURL(file);
  }

  async uploadImage(): Promise<void> {
    const file = this.selectedFile();
    if (!file) {
      return;
    }

    this.clearAlert();
    this.isUploading.set(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const result = await firstValueFrom(
        this.http.post<ImageProcessResult>(`${API_URL}/upload`, formData),
      );

      // Agregar al inicio de la galería (máx 10) y limpiar el formulario
      this.recentUploads.update((prev) =>
        [
          {
            key: result.thumbnailKey
              .replace('thumbnails/', '')
              .replace('-thumb.jpg', ''),
            thumbnailUrl: result.thumbnailUrl,
            processedUrl: result.processedUrl,
            uploadedAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 10),
      );

      this.previewUrl.set(null);
      this.selectedFile.set(null);
      this.showAlert(
        'success',
        `Imagen procesada: ${result.width}x${result.height}px — ${result.originalFilename}`,
        3000,
      );
    } catch (error) {
      console.error(error);
      this.showAlert('error', 'Error al guardar la imagen. Intenta nuevamente');
    } finally {
      this.isUploading.set(false);
    }
  }

  private async loadRecentUploads(): Promise<void> {
    try {
      const items = await firstValueFrom(
        this.http.get<ThumbnailItem[]>(`${API_URL}/uploads`),
      );
      this.recentUploads.set(items);
    } catch {
      // No crítico — la galería inicia vacía si falla
    }
  }

  /**
   * Muestra una alerta reemplazando cualquier alerta anterior.
   * Si se pasa autoDismissMs, la alerta se limpia automáticamente tras ese tiempo.
   */
  private showAlert(
    type: AlertType,
    message: string,
    autoDismissMs?: number,
  ): void {
    // Cancelar cualquier timer previo para evitar que limpie la nueva alerta
    if (this.alertTimer !== null) {
      clearTimeout(this.alertTimer);
      this.alertTimer = null;
    }
    this.alert.set({ type, message });

    if (autoDismissMs) {
      this.alertTimer = setTimeout(() => {
        this.alert.set(null);
        this.alertTimer = null;
      }, autoDismissMs);
    }
  }

  private clearAlert(): void {
    if (this.alertTimer !== null) {
      clearTimeout(this.alertTimer);
      this.alertTimer = null;
    }
    this.alert.set(null);
  }

  openModal(url: string): void {
    this.modalImageUrl.set(url);
  }

  closeModal(): void {
    this.modalImageUrl.set(null);
  }

  async deleteImage(key: string): Promise<void> {
    this.deletingKey.set(key);
    this.clearAlert();

    try {
      await firstValueFrom(this.http.delete(`${API_URL}/uploads/${key}`));
      this.recentUploads.update((prev) => prev.filter((i) => i.key !== key));

      this.showAlert(
        'deleted',
        'Imagen eliminada correctamente del bucket R2',
        3000,
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      this.showAlert(
        'error',
        'Error al eliminar la imagen. Intenta nuevamente',
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      this.deletingKey.set(null);
    }
  }
}
