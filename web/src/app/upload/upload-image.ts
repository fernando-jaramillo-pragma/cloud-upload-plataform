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

@Component({
  selector: 'app-upload',
  templateUrl: './upload-image.html',
  styleUrl: './upload-image.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadImage implements OnInit {
  private readonly http = inject(HttpClient);

  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly isUploading = signal(false);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly recentUploads = signal<ThumbnailItem[]>([]);
  readonly modalImageUrl = signal<string | null>(null);

  ngOnInit(): void {
    this.loadRecentUploads();
  }

  onSelectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.clearMessages();

    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];

    if (!file.type.startsWith('image/')) {
      this.errorMessage.set('Solo se permiten imágenes');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxSize) {
      this.errorMessage.set('La imagen no debe exceder 10MB');
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

    this.clearMessages();
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
            thumbnailUrl: result.thumbnailUrl,
            processedUrl: result.processedUrl,
            uploadedAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 10),
      );

      this.previewUrl.set(null);
      this.selectedFile.set(null);
      this.successMessage.set(
        `¡Imagen procesada! ${result.width}×${result.height}px — ${result.originalFilename}`,
      );
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Error al guardar la imagen. Intenta nuevamente');
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

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  openModal(url: string): void {
    this.modalImageUrl.set(url);
  }

  closeModal(): void {
    this.modalImageUrl.set(null);
  }
}
