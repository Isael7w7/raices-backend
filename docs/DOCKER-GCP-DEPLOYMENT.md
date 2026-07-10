# 🐳 Guía de Docker y Deploy en GCP Cloud Run

> **Para:** Isa (Backend Developer)  
> **Autor:** Equipo Raíces  
> **Fecha:** Julio 2026  
> **Objetivo:** Documentar el proceso de containerización y despliegue del backend en Google Cloud Platform

---

## 📋 Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Archivos Nuevos](#2-archivos-nuevos)
3. [Guía Rápida de Deploy](#3-guía-rápida-de-deploy)
4. [Variables de Entorno](#4-variables-de-entorno)
5. [Troubleshooting Backend](#5-troubleshooting-backend)
6. [Tareas de Mantenimiento](#6-tareas-de-mantenimiento)

---

## 1. Resumen Ejecutivo

**¿Qué hicimos?** Configuramos Docker y Google Cloud Run para deployar el backend de NestJS.

**¿Por qué?** Para que el backend funcione en la nube de forma estable, escalable y sin preocuparnos por servidores.

**¿Qué necesitas saber?**
- El `Dockerfile` ya está configurado y probado
- El `deploy.sh` automatiza todo el proceso
- Solo necesitas tener instalado Docker Desktop y gcloud CLI

---

## 2. Archivos Nuevos

### 📁 Estructura de archivos nuevos

```
raices-backend/
├── Dockerfile              ← Configuración del contenedor
├── .dockerignore           ← Archivos excluidos del build
├── docker-compose.yml      ← Para testing local
├── deploy.sh               ← Script de deploy automatizado
└── .env.production.example ← Plantilla de variables de entorno
```

### Archivos importantes para ti:

| Archivo | Uso frecuente |
|---------|---------------|
| `Dockerfile` | Modificar cuando cambien dependencias o configuración de build |
| `deploy.sh` | Ejecutar cada vez que hagas deploy |
| `.env.production` | **NUNCA** subir a Git, contiene secretos |

---

## 3. Guía Rápida de Deploy

### Requisitos previos:
```bash
# 1. Instalar Docker Desktop (si no lo tienes)
# Descargar desde: https://www.docker.com/products/docker-desktop

# 2. Instalar gcloud CLI (si no lo tienes)
# Descargar desde: https://cloud.google.com/sdk/docs/install

# 3. Autenticarse con GCP
gcloud auth login
gcloud config set project raices-499122
```

### Deploy completo:
```bash
cd raices-backend
./deploy.sh deploy
```

### Deploy con versión específica:
```bash
./deploy.sh deploy v1.0.0
```

### Solo buildear (sin deployar):
```bash
./deploy.sh build
```

### Ver logs:
```bash
./deploy.sh logs
```

### Ver URL del servicio:
```bash
./deploy.sh url
```

---

## 4. Variables de Entorno

### Crear archivo de producción:
```bash
# Copiar plantilla
cp .env.production.example .env.production

# Editar con tus valores
nano .env.production
```

### Variables necesarias:

| Variable | Descripción | Dónde obtenerla |
|----------|-------------|-----------------|
| `FIREBASE_PROJECT_ID` | ID del proyecto | Consola Firebase → Configuración |
| `FIREBASE_CLIENT_EMAIL` | Email de cuenta de servicio | Firebase → Cuentas de servicio |
| `FIREBASE_PRIVATE_KEY` | Clave privada | Firebase → Cuentas de servicio → Generar clave |
| `JWT_SECRET` | Secreto para tokens | Crear uno seguro (ej: `openssl rand -base64 32`) |
| `ANTHROPIC_API_KEY` | API key de IA | https://console.anthropic.com/ |
| `CORS_ORIGINS` | Dominios permitidos | Tu dominio de frontend |

### ⚠️ REGLAS DE SEGURIDAD:
- **NUNCA** subas `.env.production` a Git
- **NUNCA** compartas tus llaves privadas
- Usa el archivo `.env.production.example` como referencia
- Si una clave se compromete, revócala inmediatamente

---

## 5. Troubleshooting Backend

### Problema: "pnpm install falls with ERR_PNPM_IGNORED_BUILDS"
```
Causa: pnpm 11+ tiene una nueva seguridad que bloquea build scripts
Solución: Ya está resuelto con --ignore-scripts en el Dockerfile
Acción: No necesitas hacer nada, solo saber que existe
```

### Problema: "Docker build lento"
```
Causa: Instalación de dependencias cada vez
Solución: Docker usa caché automáticamente
Tip: Si ves "CACHED" en los logs, significa que está usando caché
```

### Problema: "Deploy falla con error 503"
```
Causa: La aplicación no inicia correctamente
Solución: Revisar logs con ./deploy.sh logs
Comandos útiles:
  - Ver logs recientes: gcloud run services logs read raices-backend --limit=100
  - Ver logs en tiempo real: gcloud run services logs tail raices-backend
```

### Problema: "Variables de entorno no están disponibles"
```
Causa: No se pasaron al deploy
Solución: Verificar que .env.production existe y tiene las variables
Verificar: gcloud run services describe raices-backend --region=us-central1
```

### Problema: "La app funciona local pero no en Cloud Run"
```
Causa: Diferencias entre entorno local y producción
Pasos para diagnosticar:
  1. Verificar variables de entorno: gcloud run services describe raices-backend
  2. Verificar logs: ./deploy.sh logs
  3. Probar localmente con variables de producción
```

---

## 6. Tareas de Mantenimiento

### Actualizar dependencias:
```bash
# 1. Actualizar localmente
pnpm update

# 2. Probar que todo funciona
pnpm dev

# 3. Hacer deploy
./deploy.sh deploy
```

### Actualizar Node.js version:
```bash
# Editar Dockerfile, cambiar:
FROM node:22-alpine
# Por la versión que necesites

# Luego hacer deploy
./deploy.sh deploy
```

### Rollback a versión anterior:
```bash
# Deployar versión específica
./deploy.sh deploy v1.0.0

# O deployar la última versión conocida que funcionaba
./deploy.sh deploy latest
```

### Monitoreo en GCP:
```
1. Ir a: https://console.cloud.google.com/run
2. Seleccionar el servicio "raices-backend"
3. Revisar:
   - Métricas de CPU y memoria
   - Número de instancias
   - Tiempos de respuesta
   - Errores
```

---

## 📚 Referencia Rápida

### Comandos Docker útiles:
```bash
# Ver imágenes locales
docker images | grep raices-backend

# Ejecutar contenedor localmente
docker run -p 7000:7000 raices-backend:latest

# Ver logs del contenedor
docker logs <container_id>

# Entrar al contenedor (para debugging)
docker exec -it <container_id> sh
```

### Comandos gcloud útiles:
```bash
# Ver servicios deployados
gcloud run services list

# Ver detalles del servicio
gcloud run services describe raices-backend

# Eliminar servicio
gcloud run services delete raices-backend

# Ver logs
gcloud run services logs read raices-backend --limit=50
```

---

## ❓ Preguntas Frecuentes

**¿Cuánto cuesta deployar?**
Cloud Run tiene tier gratuito: 180,000 vCPU-segundos/mes. Para desarrollo es suficiente.

**¿Cuánto tarda el deploy?**
2-5 minutos promedio.

**¿Cómo actualizo sin downtime?**
Cloud Run hace deploy gradual automáticamente. No hay downtime.

**¿Puedo tener múltiples versiones?**
Sí, puedes hacer deploy con diferentes tags (v1.0.0, v1.1.0, etc.)

**¿Dónde veo métricas?**
Consola GCP → Cloud Run → raices-backend → Pestaña "Métricas"

---

## 🔗 Recursos

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Docker Documentation](https://docs.docker.com/)
- [NestJS Deployment Guide](https://docs.nestjs.com/deployment)
