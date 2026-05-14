# Cloud Image Workshop

Aplicación full stack para subir imágenes, procesarlas en la nube y guardar el resultado en Cloudflare R2.

1. La app web permite seleccionar una imagen.
2. La API recibe el archivo y llama a una función Lambda.
3. La Lambda valida la imagen, la redimensiona, la convierte a escala de grises y genera un thumbnail.
4. Los archivos procesados se guardan en Cloudflare R2.
5. La web muestra una galería con las últimas imágenes procesadas.

## Proyectos

| Proyecto | Tipo | Para qué sirve | Comandos útiles |
| --- | --- | --- | --- |
| `web` | App Angular | Interfaz para subir imágenes y ver la galería | `pnpm nx serve web`<br>`pnpm nx build web`<br>`pnpm nx test web` |
| `api` | Backend Node + Express | Recibe el upload, invoca la Lambda y lista imágenes desde R2 | `pnpm nx serve api`<br>`pnpm nx build api` |
| `image-processor` | AWS Lambda | Procesa imágenes con Sharp y las sube a R2 | `pnpm nx build image-processor` |
| `upload` | Librería Angular | Librería compartida para UI/funcionalidad de upload. Ahora mismo está muy básica | `pnpm nx test upload`<br>`pnpm nx lint upload` |
| `models` | Librería TypeScript | Interfaces y tipos compartidos entre web, API y Lambda | `pnpm nx build models` |
| `web-e2e` | Pruebas E2E | Tests end-to-end con Playwright para la app web | `pnpm nx e2e web-e2e` |

## Tecnologías

- Nx para organizar el monorepo
- pnpm como package manager
- Angular 21 para el frontend
- Express para la API
- AWS Lambda para el procesamiento de imágenes
- Sharp para redimensionar y transformar imágenes
- Cloudflare R2 para almacenamiento
- Playwright para pruebas E2E

## Cómo funciona

```text
Usuario
	-> Web (Angular)
	-> API (Express)
	-> Lambda image-processor
	-> Cloudflare R2
	-> API responde con URLs
	-> Web actualiza la galería
```

## Flujo de procesamiento

### Web

La aplicación web:

- deja seleccionar una imagen
- valida que sea una imagen
- limita el tamaño a 1 MB en el frontend
- envía el archivo a la API
- carga las últimas imágenes disponibles

### API

La API expone estos endpoints:

- `GET /` devuelve un mensaje simple de prueba
- `GET /uploads` devuelve las últimas 10 imágenes procesadas
- `POST /upload` recibe una imagen en `multipart/form-data` usando el campo `image`

La API además:

- limita el upload a 5 MB
- invoca la Lambda de forma síncrona
- devuelve al frontend las URLs públicas del resultado

### Lambda

La función `image-processor`:

- acepta imágenes `jpeg`, `png` y `webp`
- rechaza imágenes de más de 10 megapíxeles
- redimensiona la imagen a un máximo de 1200 px
- convierte la imagen a escala de grises
- genera un thumbnail cuadrado de 200 x 200 px
- sube la imagen procesada y el thumbnail a R2

## Estructura del repositorio

```text
api/                    Backend Express
features/upload/        Librería Angular compartida
packages/image-processor/ Lambda para procesamiento de imágenes
shared/models/          Tipos compartidos
web/                    App Angular
web-e2e/                Pruebas E2E con Playwright
```

## Requisitos previos

Antes de empezar necesitas:

- Node.js 20 o superior
- pnpm instalado globalmente
- una cuenta/configuración de AWS Lambda
- un bucket de Cloudflare R2 con acceso S3-compatible

Si no tienes `pnpm`:

```bash
npm install -g pnpm
```

## Instalación

```bash
pnpm install
```

## Variables de entorno

Este proyecto necesita variables de entorno para conectar la API y la Lambda con AWS y Cloudflare R2.

Variables usadas por la API:

- `HOST`: host del servidor API. Por defecto `localhost`
- `PORT`: puerto del servidor API. Por defecto `3000`
- `AWS_REGION`: región de AWS para invocar Lambda. Por defecto `us-east-1`
- `LAMBDA_FUNCTION_NAME`: nombre de la función Lambda. Por defecto `image-processor`
- `R2_ACCOUNT_ID`: account id de Cloudflare R2
- `R2_ACCESS_KEY_ID`: access key de R2
- `R2_SECRET_ACCESS_KEY`: secret key de R2
- `R2_BUCKET_NAME`: nombre del bucket
- `R2_PUBLIC_URL`: URL pública base del bucket

Variables usadas por la Lambda:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL`

Un ejemplo básico:

```bash
HOST=localhost
PORT=3000
AWS_REGION=us-east-1
LAMBDA_FUNCTION_NAME=image-processor
R2_ACCOUNT_ID=tu-account-id
R2_ACCESS_KEY_ID=tu-access-key
R2_SECRET_ACCESS_KEY=tu-secret-key
R2_BUCKET_NAME=tu-bucket
R2_PUBLIC_URL=https://tu-dominio-publico-o-r2.dev
```

## Ejecutar en desarrollo

### 1. Levantar la API

```bash
pnpm nx serve api
```

La API queda disponible en `http://localhost:3000` si no cambias el puerto.

### 2. Levantar la web

```bash
pnpm nx serve web
```

La web normalmente queda disponible en `http://localhost:4200`.

### 3. Compilar la Lambda

```bash
pnpm nx build image-processor
```

Esto compila la Lambda y deja la salida en `dist/packages/image-processor`.

Importante: esto no genera un ZIP automáticamente.

Con la configuración actual, el build deja al menos estos archivos:

- `main.js`
- `package.json`
- `pnpm-lock.yaml`

Si quieres desplegar la función en AWS Lambda, normalmente necesitas un paso adicional de empaquetado.

Para generar el ZIP listo para subir a AWS Lambda ejecuta:

```bash
pnpm nx package image-processor
```

Con eso:

- compila el código con esbuild
- instala `sharp` compilado para Linux x64 (el entorno de AWS Lambda)
- genera el archivo ZIP

El ZIP final quedaría en `dist/packages/image-processor.zip`.

## Despliegue de la Lambda

Si necesitas un artefacto desplegable, hay dos cosas a tener en cuenta:

- `build` compila el código
- empaquetar para AWS Lambda es un paso aparte

Además, `sharp` está marcado como dependencia externa en el build, así que el paquete final de despliegue debe incluir esa dependencia de runtime.

Por eso no alcanza con compilar: también hay que instalar `sharp` dentro de la carpeta generada antes de comprimir.

Si más adelante quieres automatizarlo, lo razonable sería agregar un target de Nx que:

1. ejecute `pnpm nx build image-processor`
2. prepare la carpeta final de despliegue
3. genere el archivo ZIP

## Comandos útiles

```bash
pnpm nx build web
pnpm nx test web
pnpm nx build api
pnpm nx build models
pnpm nx test upload
pnpm nx lint upload
pnpm nx e2e web-e2e
```

## Modelos compartidos

La librería `models` define los contratos que comparten varias partes del sistema, por ejemplo:

- payload que la API envía a la Lambda
- respuesta del procesamiento de imagen
- estructura de los thumbnails para la galería

Esto evita duplicar tipos entre frontend y backend.

## Notas importantes

- La web llama a la API usando `http://localhost:3000` de forma fija en desarrollo.
- El proyecto `upload` existe como librería Angular, pero hoy la lógica principal de subida vive en la app `web`.
- Para que el flujo completo funcione, la API debe poder invocar una Lambda real y esa Lambda debe tener acceso a R2.

## Resumen rápido

Si quieres arrancar lo mínimo para trabajar en el proyecto:

```bash
pnpm install
pnpm nx serve api
pnpm nx serve web
```

Si además quieres validar E2E:

```bash
pnpm nx e2e web-e2e
```
