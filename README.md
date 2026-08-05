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
| `FIREBASE_SERVICE_ACCOUNT` | JSON de cuenta de servicio (una línea) | `{"type":"service_account",...}` |

### Variables Opcionales

| Variable | Descripción | Valor por Defecto |
|----------|-------------|-------------------|
| `PORT` | Puerto del servidor | `7000` |
| `NODE_ENV` | Entorno de ejecución | `development` |
| `FIREBASE_API_KEY` | API Key de Firebase Auth | — |
| `ANTHROPIC_API_KEY` | API Key de Anthropic para IA | — |
| `CORS_ORIGINS` | Dominios permitidos (separados por coma) | — |
| `RESEND_API_KEY` | API Key de Resend para emails | — |

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

- **NUNCA** subir archivos `.env` a Git
- Las credenciales de Firebase se validan al iniciar
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

### Google Cloud Run
```bash
# Ejecutar script de deploy
./deploy.sh deploy
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
