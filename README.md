# 🌱 Raíces Backend

API del ecosistema digital para personas con discapacidad en México. Backend construido con NestJS y Firebase.

## 🚀 Inicio Rápido

### Requisitos
- Node.js 22+
- pnpm
- Firebase project (o credenciales de servicio)

### Instalación
```bash
# Clonar el repositorio
git clone https://github.com/Isael7w7/raices-backend.git
cd raices-backend

# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Iniciar en modo desarrollo
pnpm dev
```

### URL de la API
- **API:** http://localhost:7000/api
- **Swagger Docs:** http://localhost:7000/docs

---

## 🔧 Variables de Entorno

Las variables de entorno se configuran en el archivo `.env` (nunca subir a Git).

### Variables Obligatorias

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `FIREBASE_PROJECT_ID` | ID del proyecto Firebase | `mi-proyecto-id` |
| `FIREBASE_CREDENTIALS` | JSON de la cuenta de servicio en una línea (secreto montado desde GCP Secret Manager en Cloud Run). Alias retrocompatible: `FIREBASE_SERVICE_ACCOUNT` | `{"type":"service_account",...}` |

### Variables Opcionales

| Variable | Descripción | Valor por Defecto |
|----------|-------------|-------------------|
| `PORT` | Puerto del servidor | `7000` |
| `NODE_ENV` | Entorno de ejecución | `development` |
| `FIREBASE_API_KEY` | API Key de Firebase Auth | — |
| `VERTEX_AI_PROJECT_ID` | Proyecto GCP para Vertex AI (fallback: `FIREBASE_PROJECT_ID`) | — |
| `VERTEX_AI_LOCATION` | Región de Vertex AI | `us-central1` |
| `VERTEX_AI_MODEL` | Modelo Gemini a usar | `gemini-2.0-flash` |
| `CORS_ORIGINS` | Dominios permitidos (separados por coma) | — |
| `RESEND_API_KEY` | API Key de Resend para emails (secreto) | — |
| `FIREBASE_STORAGE_BUCKET` | Bucket de Cloud Storage (se deriva del proyecto si se omite) | — |

### Variables de Negocio

| Variable | Descripción | Valor por Defecto |
|----------|-------------|-------------------|
| `MAX_DEPENDIENTES_POR_TUTOR` | Límite máximo de dependientes por cuenta de tutor | `5` |

#### `MAX_DEPENDIENTES_POR_TUTOR`

Esta variable controla cuántos dependientes puede registrar un tutor en la plataforma.

**Comportamiento:**
- Si no está definida o es inválida, usa el valor por defecto: `5`
- Debe ser un número entero positivo
- Se valida en el endpoint `POST /api/usuarios/dependientes`

**Ejemplo de uso:**
```bash
# Permitir hasta 10 dependientes por tutor
MAX_DEPENDIENTES_POR_TUTOR=10
```

**Respuesta del endpoint de conteo:**
```json
GET /api/usuarios/dependientes/count

{
  "total": 3,
  "limite": 10,
  "restantes": 7
}
```

---

## 📁 Estructura del Proyecto

```
raices-backend/
├── src/
│   ├── common/
│   │   ├── decorators/      # Decoradores personalizados
│   │   ├── guards/          # Guards de autenticación y autorización
│   │   ├── interceptors/    # Interceptors (ETag, etc.)
│   │   ├── interfaces/      # Interfaces TypeScript
│   │   └── utils/           # Funciones auxiliares
│   ├── database/
│   │   ├── seed/            # Scripts de seed
│   │   └── firebase.provider.ts
│   ├── modules/
│   │   ├── admin/           # Panel administrativo
│   │   ├── ai/              # Chat y recomendaciones IA
│   │   ├── auth/            # Autenticación y registro
│   │   ├── catalogs/        # Catálogos de referencia
│   │   ├── community/       # Comunidad (posts, grupos)
│   │   ├── discovery/       # Búsqueda inteligente
│   │   ├── email/           # Servicio de email
│   │   ├── favorites/       # Favoritos
│   │   ├── institutions/    # Directorio de instituciones
│   │   ├── jobs/            # Bolsa de trabajo
│   │   ├── messages/        # Mensajería directa
│   │   ├── notifications/   # Notificaciones
│   │   ├── reviews/         # Reseñas y calificaciones
│   │   ├── storage/         # Gestión de archivos
│   │   └── users/           # Gestión de usuarios
│   ├── app.module.ts
│   └── main.ts
├── docs/                    # Documentación
├── scripts/                 # Scripts utilitarios
├── Dockerfile
├── docker-compose.yml
└── deploy.sh
```

---

## 🛡️ Seguridad

- **NUNCA** subir archivos `.env` ni archivos de cuenta de servicio (`*service-account*.json`, `*credentials.json`) a Git
- Los secretos (`FIREBASE_CREDENTIALS`, `RESEND_API_KEY`, `FIREBASE_API_KEY`) se consumen vía `ConfigService` (variables de entorno) y, en producción, se montan desde **GCP Secret Manager** en Cloud Run (`--set-secrets`) — nunca se inyectan en la imagen Docker
- Vertex AI se autentica con **Application Default Credentials** (cuenta de servicio de Cloud Run); no requiere API key embebida
- Las credenciales de Firebase se validan al iniciar (JSON bien formado, `project_id` consistente)
- Rate limiting habilitado (100 requests/minuto)
- CORS configurado para orígenes específicos

---

## 🧪 Pruebas

```bash
# Ejecutar todos los tests
pnpm test

# Ejecutar tests en watch mode
pnpm test:watch

# Ejecutar con cobertura
pnpm test:cov
```

---

## 🚢 Despliegue

### Docker
```bash
# Build y ejecutar
docker-compose up -d

# Ver logs
docker-compose logs -f
```

### Google Cloud Run (Secret Manager)

Los secretos (`FIREBASE_CREDENTIALS`, `RESEND_API_KEY`) se gestionan en **GCP Secret Manager** y se montan en Cloud Run con `--set-secrets`; las variables no sensibles (`NODE_ENV`, `PORT`, `CORS_ORIGINS`, `VERTEX_AI_*`) se pasan como env vars normales.

#### 1. Requisitos previos (una sola vez)
```bash
gcloud auth login
gcloud config set project raices-499122
```

#### 2. Sincronizar secretos desde `.env.production`

El archivo `.env.production` (no versionado) debe contener las variables canónicas:
```
FIREBASE_CREDENTIALS={"type":"service_account",...}   # JSON en UNA sola línea
RESEND_API_KEY=re_xxx                                # opcional
```

Ejecuta (estando en la raíz del repo):
```bash
# Solo sincronizar secretos a GCP (crea los secretos si no existen y añade la versión)
./deploy.sh secrets

# Si tu archivo se llama distinto
./deploy.sh secrets .env.production

# Sincronizar secretos Y desplegar a Cloud Run
./deploy.sh deploy
```

> **Nota**: el script crea automáticamente el secreto `FIREBASE_CREDENTIALS`, guarda una nueva versión y otorga acceso a la cuenta de servicio del Cloud Run (`roles/secretmanager.secretAccessor`). Si tu archivo aún usa el alias `FIREBASE_SERVICE_ACCOUNT`, se migrará al secreto `FIREBASE_CREDENTIALS` (con un aviso).

#### 3. Verificar
```bash
# Listar secretos
gcloud secrets list --project raices-499122

# Ver las versiones de un secreto
gcloud secrets versions list FIREBASE_CREDENTIALS --project raices-499122
```

Si prefieres crear los secretos a mano:
```bash
gcloud secrets create FIREBASE_CREDENTIALS --project raices-499122 --replication-policy=automatic
printf '%s' '{"type":"service_account",...}' | gcloud secrets versions add FIREBASE_CREDENTIALS --data-file=-
gcloud secrets add-iam-policy-binding FIREBASE_CREDENTIALS \
  --member="serviceAccount:firebase-adminsdk-fbsvc@raices-499122.iam.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor --project raices-499122
```

Ver [docs/DOCKER-GCP-DEPLOYMENT.md](docs/DOCKER-GCP-DEPLOYMENT.md) para más detalles.

---

## 📚 Documentación

- [Flujo de Aprobación de Instituciones](docs/FLUJO-APROBACION-VACANTES.md)
- [Flujo Tutor ↔ PCD](docs/FLUJO-TUTOR-PCD.md)
- [Guía de Docker y Deploy](docs/DOCKER-GCP-DEPLOYMENT.md)

---

## 🤝 Contribuir

1. Fork el proyecto
2. Crear una rama para tu feature (`git checkout -b feature/nueva-feature`)
3. Hacer commit de tus cambios (`git commit -m 'Add nueva feature'`)
4. Push a la rama (`git push origin feature/nueva-feature`)
5. Abrir un Pull Request

---

## 📄 Licencia

Este proyecto es privado. Todos los derechos reservados.
