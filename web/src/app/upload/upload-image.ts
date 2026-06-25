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
import { AuthService } from '../auth/auth.service';

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
  protected readonly auth = inject(AuthService);
  private alertTimer: ReturnType<typeof setTimeout> | null = null;

  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly isUploading = signal(false);
  readonly isLoading = signal(false);
  readonly alert = signal<Alert | null>(null);
  
  // Pestaña activa ('my-photos' o 'public')
  readonly activeTab = signal<'my-photos' | 'public'>('my-photos');
  
  // Fotos del usuario
  readonly recentUploads = signal<ThumbnailItem[]>([]);
  
  // Fotos públicas de todos los usuarios
  readonly publicUploads = signal<ThumbnailItem[]>([]);

  readonly modalImageUrl = signal<string | null>(null);
  readonly deletingKey = signal<string | null>(null);
  readonly togglingKey = signal<string | null>(null);

  ngOnInit(): void {
    this.loadRecentUploads();
    this.loadPublicUploads();
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
        this.http.post<ImageProcessResult & { isPublic: boolean }>(`${API_URL}/upload`, formData),
      );

      // Extraer el key/uuid robustamente
      const parts = result.thumbnailKey.split('/');
      const filename = parts[parts.length - 1] ?? '';
      const key = filename.replace('-thumb.jpg', '');

      // Agregar al inicio de la galería (máx 10) y limpiar el formulario
      this.recentUploads.update((prev) =>
        [
          {
            key,
            thumbnailUrl: result.thumbnailUrl,
            processedUrl: result.processedUrl,
            uploadedAt: new Date().toISOString(),
            isPublic: false,
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

  switchTab(tab: 'my-photos' | 'public'): void {
    this.activeTab.set(tab);
    if (tab === 'public') {
      this.loadPublicUploads();
    } else {
      this.loadRecentUploads();
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

  async loadPublicUploads(): Promise<void> {
    try {
      const items = await firstValueFrom(
        this.http.get<any[]>(`${API_URL}/uploads/public`),
      );
      const mapped: ThumbnailItem[] = items.map((item) => ({
        key: item.key,
        thumbnailUrl: item.thumbnailUrl,
        processedUrl: item.processedUrl,
        uploadedAt: item.publishedAt,
        isPublic: true,
        ownerName: item.ownerName,
      }));
      this.publicUploads.set(mapped);
    } catch {
      // No crítico
    }
  }

  async toggleVisibility(item: ThumbnailItem): Promise<void> {
    this.togglingKey.set(item.key);
    this.clearAlert();
    const newStatus = !item.isPublic;

    try {
      await firstValueFrom(
        this.http.patch(`${API_URL}/uploads/${item.key}/visibility`, {
          isPublic: newStatus,
        }),
      );

      this.recentUploads.update((prev) =>
        prev.map((i) => (i.key === item.key ? { ...i, isPublic: newStatus } : i)),
      );

      this.loadPublicUploads();

      this.showAlert(
        'success',
        newStatus ? 'Imagen compartida públicamente' : 'Imagen configurada como privada',
        3000,
      );
    } catch {
      this.showAlert('error', 'Error al cambiar la visibilidad de la imagen');
    } finally {
      this.togglingKey.set(null);
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
      this.publicUploads.update((prev) => prev.filter((i) => i.key !== key));

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

