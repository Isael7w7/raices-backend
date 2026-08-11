# 🚀 Guía de Integración Frontend — Raíces para Florecer

**Última actualización:** 11 de agosto, 2026  \
**Stack del frontend:** React 18 + Vite + React Router v6 (+ opcional Axios)  \
**Backend API:** `https://raices-backend-jftu6lrbda-uc.a.run.app/api`  \
**Documentación Swagger:** `https://raices-backend-jftu6lrbda-uc.a.run.app/docs`

---

## 📋 Índice

1. [Arquitectura General](#-arquitectura-general)
2. [Autenticación](#-autenticación)
3. [Sistema de Permisos](#-sistema-de-permisos)
4. [Ejemplos de Integración](#-ejemplos-de-integración)
5. [Manejo de Errores](#-manejo-de-errores)
6. [Buenas Prácticas](#-buenas-prácticas)

---

## 🏗️ Arquitectura General

### Flujo de Autenticación
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  Firebase   │
│  (React)    │◀────│  (NestJS)   │◀────│  (Auth)     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │  1. Login         │                   │
       │──────────────────▶│  2. Verificar     │
       │                   │──────────────────▶│
       │                   │  3. ID Token      │
       │                   │◀──────────────────│
       │  4. { tokenAcceso, tokenRefresco }    │
       │     + Set-Cookie httpOnly            │
       │◀──────────────────│                   │
       │                   │                   │
       │  5. Request API   │                   │
       │  Bearer <token>   │                   │
       │  o cookie httpOnly│                   │
       │  (automática)     │                   │
       │──────────────────▶│  6. Verificar     │
       │                   │  token con        │
       │                   │  verifyIdToken()  │
       │  7. Respuesta     │                   │
       │◀──────────────────│                   │
```

### Estructura de Tokens
```typescript
interface AuthTokens {
  tokenAcceso: string;    // JWT de Firebase (expira en 1 hora)
  tokenRefresco: string;  // Para renovar el token de acceso
  expiraEn: number;       // Segundos hasta expiración (3600)
}

interface Usuario {
  id: string;
  email: string;
  nombreCompleto: string;
  rol: 'pcd' | 'tutor' | 'institucion' | 'admin';
  avatarUrl?: string;
  features: FeatureFlags;
}

interface FeatureFlags {
  chat: boolean;
  postulaciones: boolean;
  comunidad: boolean;
  resenas: boolean;
  descubrimiento: boolean;
  favoritos: boolean;
  multimedia: boolean;
}
```

> **Nuevo (11 de agosto, 2026):** además del body, `login` y `renovar-token`
> entregan los tokens como **cookies httpOnly** (`token_acceso`, `token_refresco`).
> El backend acepta autenticación por cookie **o** por header `Authorization: Bearer`.
> Ver [Flujo Recomendado: Cookies httpOnly](#4-flujo-recomendado-cookies-httponly-sin-localstorage).

---

## 🔐 Autenticación

### 1. Contexto de Autenticación

El equivalente React del "servicio de autenticación": un `AuthContext` que
guarda el **perfil del usuario en memoria** (nunca el token) y expone el hook
`useAuth()`. Con el flujo de cookies httpOnly, **el token no toca el JS**:
el navegador lo adjunta solo.

```tsx
// src/auth/auth-context.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

const API_URL = 'https://raices-backend-jftu6lrbda-uc.a.run.app/api'

interface LoginResponse {
  tokenAcceso: string
  tokenRefresco: string
  expiraEn: number
  usuario: Usuario
}

interface AuthContextValue {
  usuario: Usuario | null
  login: (email: string, password: string) => Promise<Usuario>
  logout: () => Promise<void>
  renovarToken: () => Promise<void>
  tieneFeature: (feature: keyof FeatureFlags) => boolean
  tieneRol: (...roles: string[]) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)

  // Rehidratación al cargar la app: como el JS no puede leer la cookie
  // httpOnly, se consulta GET /autenticacion/yo (el navegador manda la cookie
  // sola gracias a credentials: 'include').
  useEffect(() => {
    fetch(`${API_URL}/autenticacion/yo`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((u) => { if (u) setUsuario(u) })
      .catch(() => { /* sin sesión: estado inicial null */ })
  }, [])

  async function login(email: string, password: string): Promise<Usuario> {
    const res = await fetch(`${API_URL}/autenticacion/inicio-sesion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',          // ← el navegador guarda las cookies httpOnly
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) throw new Error('Credenciales incorrectas')
    const data: LoginResponse = await res.json()
    setUsuario(data.usuario)           // solo el perfil: el token vive en la cookie
    return data.usuario
  }

  async function logout(): Promise<void> {
    // Las cookies httpOnly NO se pueden borrar desde JS: el backend debe
    // eliminarlas vía POST /autenticacion/cerrar-sesion (obligatorio).
    try {
      await fetch(`${API_URL}/autenticacion/cerrar-sesion`, {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      setUsuario(null)
    }
  }

  async function renovarToken(): Promise<void> {
    // El backend lee token_refresco de la cookie httpOnly: no hace falta body.
    const res = await fetch(`${API_URL}/autenticacion/renovar-token`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Sesión expirada')
    const data: LoginResponse = await res.json()
    setUsuario(data.usuario)
  }

  function tieneFeature(feature: keyof FeatureFlags): boolean {
    return usuario?.features?.[feature] ?? false
  }

  function tieneRol(...roles: string[]): boolean {
    return usuario ? roles.includes(usuario.rol) : false
  }

  return (
    <AuthContext.Provider value={{ usuario, login, logout, renovarToken, tieneFeature, tieneRol }}>
      {children}
    </AuthContext.Provider>
  )
}

// Hook para consumir el contexto desde cualquier componente
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
```

**Migración desde el flujo legado (Bearer):** si por compatibilidad el cliente
aún envía el header `Authorization: Bearer`, guardar `tokenAcceso` **solo en
memoria** (una variable/ref, nunca en `localStorage`) y adjuntarlo en cada
request. La cookie httpOnly es la vía segura recomendada.

---

### 2. Cliente HTTP (fetch wrapper)

Con cookies httpOnly el navegador adjunta la cookie sola, así que este wrapper
es opcional. Se mantiene para (a) agregar el header Bearer en el flujo legado y
(b) centralizar el manejo de errores y el reintento ante 401.

```typescript
// src/api/http.ts
import { useAuth } from '../auth/auth-context' // solo para el flujo legado

const API_URL = 'https://raices-backend-jftu6lrbda-uc.a.run.app/api'

// Token en memoria (flujo legado Bearer). Con cookies httpOnly no es necesario.
let tokenEnMemoria: string | null = null

export function guardarTokenLegado(token: string | null) {
  tokenEnMemoria = token
}

interface RequestOptions extends RequestInit {
  autenticado?: boolean
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { autenticado = true, headers, ...rest } = options

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: 'include', // clave: enviar/recibir cookies httpOnly
    headers: {
      'Content-Type': 'application/json',
      ...(autenticado && tokenEnMemoria ? { Authorization: `Bearer ${tokenEnMemoria}` } : {}),
      ...headers,
    },
  })

  if (!res.ok) {
    throw new ApiError(res.status, await res.text())
  }
  return res.status === 204 ? (undefined as T) : res.json()
}
```

> **Nota (flujo cookies):** con `credentials: 'include'` y cookies httpOnly, el
> wrapper no necesita el header Bearer — el navegador adjunta la cookie sola.
> El manejo de 401 → renovar → reintentar se puede implementar con un `fetch`
> reinvocado (o un interceptor de Axios) usando `useAuth().renovarToken()`.

---

### 3. Configuración en React

```tsx
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/auth-context'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
```

---

### 4. Flujo Recomendado: Cookies httpOnly (sin localStorage)

> Este es el flujo **recomendado**: los tokens nunca tocan el JavaScript del
> cliente (ni localStorage), por lo que un XSS no puede robarlos.

**Cómo funciona**

1. `login()` con `credentials: 'include'` → el backend responde con los tokens
   en el body **y** con las cookies `httpOnly` (`token_acceso` de 1h y
   `token_refresco` de 30 días). El navegador las guarda automáticamente.
2. En cada request, el navegador adjunta la cookie sola: **no hay que manejar
   ningún token desde JS** (ni headers ni interceptors).
3. Al recargar la página, rehidratar con `GET /autenticacion/yo`
   (`credentials: 'include'`): el JS no puede leer la cookie, así que esta es
   la única forma de saber quién es el usuario.
4. Para renovar: `POST /autenticacion/renovar-token` sin body — el backend lee
   `token_refresco` de la cookie.
5. Para cerrar sesión: `POST /autenticacion/cerrar-sesion` — el backend borra
   las cookies (el JS no puede borrar cookies httpOnly).

**Ejemplo (fetch nativo)**

```typescript
// Login: el navegador recibe y guarda las cookies httpOnly
const res = await fetch(`${API_URL}/autenticacion/inicio-sesion`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',          // ← clave: enviar/recibir cookies
  body: JSON.stringify({ email, password }),
});
const { usuario } = await res.json();

// Cualquier request autenticado: solo credentials: 'include'
const perfil = await fetch(`${API_URL}/autenticacion/yo`, {
  credentials: 'include',          // el navegador manda la cookie solo
}).then(r => r.json());

// Logout: el servidor borra las cookies httpOnly
await fetch(`${API_URL}/autenticacion/cerrar-sesion`, {
  method: 'POST',
  credentials: 'include',
});
```

**Mismo flujo con Axios**

```typescript
// axios instance con withCredentials: true (envía/recibe cookies siempre)
const api = axios.create({
  baseURL: 'https://raices-backend-jftu6lrbda-uc.a.run.app/api',
  withCredentials: true,
});

// Login → el navegador guarda las cookies httpOnly
const { data } = await api.post('/autenticacion/inicio-sesion', { email, password });
const usuario = data.usuario;

// Renovar sin body: el backend lee token_refresco de la cookie
await api.post('/autenticacion/renovar-token');

// Logout: el backend borra las cookies httpOnly
await api.post('/autenticacion/cerrar-sesion');
```

**⚠️ Importante (deploy cross-site)**

Si el frontend y la API están en **orígenes distintos** (p. ej. frontend en
`raices.techmaleon.com.mx` y API en Cloud Run `*.run.app`), la cookie
`SameSite=Lax` (default) **no se envía** en requests cross-site. Para que el
flujo de cookies funcione hay que configurar en el backend:

```
COOKIE_SAMESITE=none
COOKIE_SECURE=true      # obligatorio con none; el deploy de Cloud Run ya lo activa
```

`SameSite=None` reabre la superficie CSRF, pero el backend ya la mitiga
validando el header `Origin` en peticiones de escritura autenticadas por cookie.

**Resumen de endpoints de sesión**

| Endpoint | Uso |
|----------|-----|
| `POST /autenticacion/inicio-sesion` | Login → tokens en body + cookies httpOnly |
| `POST /autenticacion/renovar-token` | Renovar (body o cookie `token_refresco`) |
| `POST /autenticacion/cerrar-sesion` | Cerrar sesión → borra cookies (204) |
| `GET /autenticacion/yo` | Perfil del usuario autenticado (rehidratación) |

---

## 🛡️ Sistema de Permisos

### 1. Estructura de Features

```typescript
// src/types/features.ts
export interface FeatureFlags {
  chat: boolean;           // Mensajería entre usuarios
  postulaciones: boolean;  // Sistema de empleo
  comunidad: boolean;      // Publicaciones y grupos
  resenas: boolean;        // Calificaciones
  descubrimiento: boolean; // Búsqueda inteligente
  favoritos: boolean;      // Instituciones favoritas
  multimedia: boolean;     // Subida de archivos
}

export const FEATURES_POR_DEFECTO: FeatureFlags = {
  chat: true,
  postulaciones: true,
  comunidad: true,
  resenas: true,
  descubrimiento: true,
  favoritos: true,
  multimedia: true,
};
```

### 2. Guard de Ruta: RequireFeature

```tsx
// src/components/RequireFeature.tsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'

export function RequireFeature({
  feature,
  children,
}: {
  feature: keyof FeatureFlags
  children: ReactNode
}) {
  const { usuario, tieneFeature } = useAuth()
  const location = useLocation()

  if (!usuario) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  if (!tieneFeature(feature)) {
    return <Navigate to="/acceso-denegado" replace />
  }
  return children
}
```

### 3. Guard de Ruta: RequireRole

```tsx
// src/components/RequireRole.tsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'

export function RequireRole({
  roles,
  children,
}: {
  roles: string[]
  children: ReactNode
}) {
  const { usuario, tieneRol } = useAuth()
  const location = useLocation()

  if (!usuario) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  if (!tieneRol(...roles)) {
    return <Navigate to="/acceso-denegado" replace />
  }
  return children
}
```

### 4. Configuración de Rutas (React Router v6)

```tsx
// src/App.tsx
import { Routes, Route } from 'react-router-dom'
import { RequireRole } from './components/RequireRole'
import { RequireFeature } from './components/RequireFeature'

export function App() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Registro />} />
      <Route path="/acceso-denegado" element={<AccesoDenegado />} />

      {/* Protegidas - Cualquier usuario autenticado */}
      <Route
        path="/perfil"
        element={
          <RequireRole roles={['pcd', 'tutor', 'institucion', 'admin']}>
            <Perfil />
          </RequireRole>
        }
      />

      {/* Protegidas - Requieren feature específica */}
      <Route
        path="/empleo/*"
        element={
          <RequireFeature feature="postulaciones">
            <EmpleoLayout />
          </RequireFeature>
        }
      />

      {/* Protegidas - Requieren rol específico */}
      <Route
        path="/institucion/*"
        element={
          <RequireRole roles={['institucion', 'admin']}>
            <InstitucionLayout />
          </RequireRole>
        }
      />

      {/* Admin */}
      <Route
        path="/admin/*"
        element={
          <RequireRole roles={['admin']}>
            <AdminLayout />
          </RequireRole>
        }
      />
    </Routes>
  )
}
```

### 5. Componente con Verificación de Feature

```tsx
// src/pages/Empleo.tsx
import { useAuth } from '../auth/auth-context'

export function Empleo() {
  const { tieneFeature, tieneRol } = useAuth()

  if (!tieneFeature('postulaciones')) {
    return (
      <div className="acceso-denegado">
        <p>Esta función no está disponible para tu cuenta.</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Bolsa de Trabajo Inclusivo</h1>

      {/* Solo instituciones */}
      {tieneRol('institucion', 'admin') && (
        <button onClick={crearVacante}>+ Crear Vacante</button>
      )}

      {/* Lista de vacantes */}
      <div className="vacantes">
        {vacantes.map((vacante) => (
          <div key={vacante.id} className="vacante-card">
            <h3>{vacante.titulo}</h3>
            <p>{vacante.descripcion}</p>
            <p>{vacante.institucionNombre}</p>

            {/* Solo PCD/Tutor */}
            {tieneRol('pcd', 'tutor') && (
              <button onClick={() => postularse(vacante.id)}>Postularme</button>
            )}

            {/* Solo Institución */}
            {tieneRol('institucion', 'admin') && (
              <button onClick={() => verPostulantes(vacante.id)}>
                Ver Postulantes ({vacante.totalPostulantes})
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 6. Componente IfFeature (renderizado condicional)

```tsx
// src/components/IfFeature.tsx
import type { ReactNode } from 'react'
import { useAuth } from '../auth/auth-context'

export function IfFeature({
  feature,
  children,
}: {
  feature: keyof FeatureFlags
  children: ReactNode
}) {
  const { tieneFeature } = useAuth()
  return tieneFeature(feature) ? children : null
}

// Uso en JSX:
// <IfFeature feature="postulaciones">
//   <button onClick={crearVacante}>Crear Vacante</button>
// </IfFeature>
```

### 7. Componente IfRole

```tsx
// src/components/IfRole.tsx
import type { ReactNode } from 'react'
import { useAuth } from '../auth/auth-context'

export function IfRole({
  roles,
  children,
}: {
  roles: string | string[]
  children: ReactNode
}) {
  const { tieneRol } = useAuth()
  const rolesArray = Array.isArray(roles) ? roles : [roles]
  return tieneRol(...rolesArray) ? children : null
}

// Uso en JSX:
// <IfRole roles="institucion"><button>Administrar</button></IfRole>
// <IfRole roles={['institucion', 'admin']}><button>Administrar</button></IfRole>
```

---

## 📡 Ejemplos de Integración

### 1. Servicio de Postulantes

```typescript
// src/services/postulantes.service.ts
import { request } from '../api/http'

interface Postulante {
  postulacionId: string;
  usuarioId: string;
  nombreCompleto: string;
  email: string;
  avatarUrl?: string;
  estado: 'pendiente' | 'aceptada' | 'rechazada' | 'en_revision';
  fechaPostulacion: string;
  cartaPresentacion: string;
}

interface RespuestaPostulantes {
  datos: Postulante[];
  paginaActual: number;
  totalPaginas: number;
  totalResultados: number;
}

export interface FiltrosPostulantes {
  vacanteId?: string;
  estado?: string;
  buscar?: string;
  page?: number;
  limite?: number;
}

function aQueryParams(filtros?: FiltrosPostulantes): string {
  const params = new URLSearchParams()
  if (filtros) {
    Object.entries(filtros).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, String(value))
      }
    })
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Obtener postulantes de una vacante específica
 * Requiere: rol institucion o admin
 */
export function obtenerPostulantesPorVacante(filtros?: FiltrosPostulantes): Promise<RespuestaPostulantes> {
  return request(`/empleo/postulantes-vacante${aQueryParams(filtros)}`)
}

/** Cambiar estado de una postulación */
export function cambiarEstado(
  postulacionId: string,
  estado: string,
  comentarios?: string
): Promise<unknown> {
  return request(`/empleo/postulaciones/${postulacionId}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado, comentarios }),
  })
}
```

### 2. Componente de Postulantes

```tsx
// src/pages/Postulantes.tsx
import { useEffect, useState } from 'react'
import {
  obtenerPostulantesPorVacante,
  cambiarEstado,
  type FiltrosPostulantes,
  type Postulante,
} from '../services/postulantes.service'

export function Postulantes({ vacanteId }: { vacanteId: string }) {
  const [postulantes, setPostulantes] = useState<Postulante[]>([])
  const [paginaActual, setPaginaActual] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroBuscar, setFiltroBuscar] = useState('')

  useEffect(() => {
    cargarPostulantes()
  }, [paginaActual, filtroEstado, filtroBuscar])

  async function cargarPostulantes() {
    try {
      const filtros: FiltrosPostulantes = {
        vacanteId,
        estado: filtroEstado || undefined,
        buscar: filtroBuscar || undefined,
        page: paginaActual,
        limite: 10,
      }
      const response = await obtenerPostulantesPorVacante(filtros)
      setPostulantes(response.datos)
      setTotalPaginas(response.totalPaginas)
    } catch (error) {
      console.error('Error cargando postulantes:', error)
    }
  }

  async function cambiarEstadoPostulacion(postulacionId: string, nuevoEstado: string) {
    try {
      await cambiarEstado(postulacionId, nuevoEstado)
      cargarPostulantes() // recargar lista
    } catch (error) {
      console.error('Error cambiando estado:', error)
    }
  }

  return (
    <div className="postulantes-container">
      <h2>Postulantes</h2>

      {/* Filtros */}
      <div className="filtros">
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aceptada">Aceptada</option>
          <option value="rechazada">Rechazada</option>
          <option value="en_revision">En revisión</option>
        </select>
        <input
          type="text"
          placeholder="Buscar por nombre o email..."
          value={filtroBuscar}
          onChange={(e) => setFiltroBuscar(e.target.value)}
        />
      </div>

      {/* Lista */}
      <div className="lista-postulantes">
        {postulantes.map((postulante) => (
          <div key={postulante.postulacionId} className="postulante-card">
            <img
              src={postulante.avatarUrl || '/assets/default-avatar.png'}
              alt={postulante.nombreCompleto}
              className="avatar"
            />
            <div className="info">
              <h3>{postulante.nombreCompleto}</h3>
              <p>{postulante.email}</p>
              <p className="fecha">
                Postuló: {new Date(postulante.fechaPostulacion).toLocaleString()}
              </p>
            </div>
            <div className={`estado ${postulante.estado}`}>
              {postulante.estado}
            </div>
            <div className="acciones">
              {postulante.estado === 'pendiente' && (
                <>
                  <button onClick={() => cambiarEstadoPostulacion(postulante.postulacionId, 'aceptada')}>
                    ✅ Aceptar
                  </button>
                  <button onClick={() => cambiarEstadoPostulacion(postulante.postulacionId, 'rechazada')}>
                    ❌ Rechazar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="paginacion">
          <button disabled={paginaActual === 1} onClick={() => setPaginaActual(paginaActual - 1)}>
            ← Anterior
          </button>
          <span>Página {paginaActual} de {totalPaginas}</span>
          <button disabled={paginaActual === totalPaginas} onClick={() => setPaginaActual(paginaActual + 1)}>
            Siguiente →
          </button>
        </div>
      )}
    </div>
  )
}
```

### 3. Servicio de Empleo

```typescript
// src/services/empleo.service.ts
import { request } from '../api/http'

// =====================
// VACANTES (Público)
// =====================

/** Listar vacantes disponibles */
export function listarVacantes(filtros?: {
  buscar?: string
  institucionId?: string
  modalidad?: string
  discapacidad?: string
  page?: number
  limite?: number
}): Promise<unknown> {
  const params = new URLSearchParams()
  if (filtros) {
    Object.entries(filtros).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.set(key, String(value))
    })
  }
  const qs = params.toString()
  return request(`/empleo${qs ? `?${qs}` : ''}`)
}

/** Obtener detalle de vacante */
export function obtenerVacante(id: string): Promise<unknown> {
  return request(`/empleo/${id}`)
}

// =====================
// VACANTES (Institución)
// =====================

/** Crear nueva vacante — requiere rol institucion o admin */
export function crearVacante(datos: {
  titulo: string
  descripcion: string
  requisitos?: string[]
  modalidad?: string
  salario?: string
  ubicacion?: string
  horario?: string
  tiposDiscapacidad?: string[]
  contactoEmail?: string
  contactoTelefono?: string
}): Promise<unknown> {
  return request('/empleo', { method: 'POST', body: JSON.stringify(datos) })
}

/** Actualizar vacante */
export function actualizarVacante(id: string, datos: unknown): Promise<unknown> {
  return request(`/empleo/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
}

/** Eliminar/desactivar vacante */
export function eliminarVacante(id: string): Promise<unknown> {
  return request(`/empleo/${id}`, { method: 'DELETE' })
}

// =====================
// POSTULACIONES (PCD/Tutor)
// =====================

/** Postularse a una vacante */
export function postularse(vacanteId: string, cartaPresentacion: string): Promise<unknown> {
  return request(`/empleo/${vacanteId}/postularse`, {
    method: 'POST',
    body: JSON.stringify({ cartaPresentacion }),
  })
}

/** Obtener IDs de vacantes postuladas */
export function obtenerVacantesPostuladas(): Promise<unknown> {
  return request('/empleo/postuladas')
}

/** Obtener mis postulaciones con detalles */
export function obtenerMisPostulaciones(filtros?: { estado?: string; buscar?: string }): Promise<unknown> {
  const params = new URLSearchParams()
  if (filtros?.estado) params.set('estado', filtros.estado)
  if (filtros?.buscar) params.set('buscar', filtros.buscar)
  const qs = params.toString()
  return request(`/empleo/mis-postulaciones${qs ? `?${qs}` : ''}`)
}

// =====================
// POSTULANTES (Institución)
// =====================

/** Obtener postulantes de MI institución */
export function obtenerPostulantesMiInstitucion(filtros?: {
  vacanteId?: string
  estado?: string
  buscar?: string
  page?: number
  limite?: number
}): Promise<unknown> {
  const params = new URLSearchParams()
  if (filtros) {
    Object.entries(filtros).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.set(key, String(value))
    })
  }
  const qs = params.toString()
  return request(`/empleo/postulantes-institucion${qs ? `?${qs}` : ''}`)
}

/** Alias: obtener postulantes por vacante */
export function obtenerPostulacionesPorVacante(vacanteId: string, filtros?: unknown): Promise<unknown> {
  return request(`/empleo/postulaciones?vacanteId=${encodeURIComponent(vacanteId)}`)
}

/** Cambiar estado de postulación */
export function cambiarEstadoPostulacion(
  postulacionId: string,
  estado: string,
  comentarios?: string
): Promise<unknown> {
  return request(`/empleo/postulaciones/${postulacionId}/estado`, {
    method: 'PATCH',
    body: JSON.stringify({ estado, comentarios }),
  })
}
```

---

## ⚠️ Manejo de Errores

### Tipos de Error del Backend

```typescript
// src/api/errores.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Traduce una Response de fetch a una excepción ApiError con el mensaje
 * del backend (NestJS devuelve { statusCode, message, error }).
 */
export async function aErrorApi(res: Response): Promise<ApiError> {
  let mensaje = 'Error del servidor'
  try {
    const body = await res.json()
    mensaje = Array.isArray(body?.message) ? body.message.join(', ') : body?.message ?? mensaje
  } catch {
    /* body no es JSON: usar mensaje genérico */
  }
  return new ApiError(res.status, mensaje)
}
```

### Hook de Errores con Toasts

```tsx
// src/hooks/useManejarError.ts
import { useCallback } from 'react'
import { toast } from 'react-hot-toast' // o la librería de toasts de tu preferencia
import { ApiError } from '../api/errores'
import { useAuth } from '../auth/auth-context'
import { useNavigate } from 'react-router-dom'

export function useManejarError() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return useCallback((error: unknown) => {
    if (error instanceof ApiError) {
      switch (error.status) {
        case 401:
          toast.error('Tu sesión ha expirado. Inicia sesión nuevamente.')
          logout()
          navigate('/login')
          break
        case 403:
          toast.error(error.message || 'No tienes permisos para esta acción')
          break
        case 429:
          toast.error('Has realizado demasiadas peticiones. Espera un momento.')
          break
        default:
          toast.error(error.message || 'Ocurrió un error')
      }
    } else {
      toast.error('Ocurrió un error inesperado')
    }
  }, [logout, navigate])
}
```

### Tabla de Códigos de Error

| Código | Mensaje | Causa | Solución |
|--------|---------|-------|----------|
| `400` | Token de refresco requerido | Falta `tokenRefresco` en body y cookie | Enviar body o cookie |
| `401` | Token inválido o expirado | Sesión vencida o token corrupto | Renovar con `renovarToken()` o relogin |
| `403` | Origen no permitido (posible CSRF) | Origin no permitido en request con cookie | Verificar `CORS_ORIGINS` |
| `403` | Rol insuficiente | Usuario sin el rol requerido | Verificar `tieneRol()` antes de navegar |
| `403` | Feature desactivada | Feature no habilitada para el usuario | Verificar `tieneFeature()` antes de mostrar UI |
| `404` | Recurso no encontrado | ID inexistente | Validar ID / mostrar estado vacío |
| `409` | Conflicto | Recurso duplicado (email, institución) | Mostrar mensaje del backend |
| `429` | Too Many Requests | Rate limit excedido | Esperar y reintentar |

---

## ✅ Buenas Prácticas

### 1. Siempre Verificar Features Antes de Mostrar UI

```tsx
// ❌ MAL
<button onClick={crearVacante}>Crear Vacante</button>

// ✅ BIEN
<IfFeature feature="postulaciones">
  <button onClick={crearVacante}>Crear Vacante</button>
</IfFeature>
```

### 2. Verificar Roles para Acciones Sensibles

```tsx
// ❌ MAL
<button onClick={eliminarVacante}>Eliminar</button>

// ✅ BIEN
<IfRole roles={['institucion', 'admin']}>
  <button onClick={eliminarVacante}>Eliminar</button>
</IfRole>
```

### 3. Usar Guards en Rutas

```tsx
// ❌ MAL - Sin protección
<Route path="empleo" element={<Empleo />} />

// ✅ BIEN - Con guards
<Route
  path="empleo"
  element={
    <RequireFeature feature="postulaciones">
      <Empleo />
    </RequireFeature>
  }
/>
```

### 4. Manejar Errores de Permiso

```tsx
async function cargarPostulantes() {
  try {
    const response = await obtenerPostulantesPorVacante({ vacanteId })
    setPostulantes(response.datos)
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      toast('No tienes permiso para ver los postulantes de esta vacante.')
      navigate('/empleo')
    } else {
      manejarError(error)
    }
  }
}
```

### 5. Evitar Múltiples Renovaciones Simultáneas

Con el flujo de cookies, la renovación es silenciosa (`POST /renovar-token` con
la cookie). Si implementás reintento ante 401, usá un flag para evitar ráfagas:

```tsx
// Ejemplo: un solo refresco a la vez
const renovando = useRef(false)

async function reintentarConRenovacion(fn: () => Promise<unknown>) {
  if (renovando.current) return
  renovando.current = true
  try {
    await renovarToken()
    return await fn()
  } finally {
    renovando.current = false
  }
}
```

### 6. Lazy Loading de Módulos (React.lazy)

```tsx
// src/App.tsx
import { lazy, Suspense } from 'react'

const Empleo = lazy(() => import('./pages/Empleo'))
const Admin = lazy(() => import('./pages/Admin'))

<Routes>
  <Route
    path="/empleo/*"
    element={
      <Suspense fallback={<Cargando />}>
        <RequireFeature feature="postulaciones">
          <Empleo />
        </RequireFeature>
      </Suspense>
    }
  />
  <Route
    path="/admin/*"
    element={
      <Suspense fallback={<Cargando />}>
        <RequireRole roles={['admin']}>
          <Admin />
        </RequireRole>
      </Suspense>
    }
  />
</Routes>
```

---

## 📚 Recursos Adicionales

- **Swagger UI:** https://raices-backend-jftu6lrbda-uc.a.run.app/docs
- **Health Check:** https://raices-backend-jftu6lrbda-uc.a.run.app/api/health
- **Documentación de Endpoints:** [API-ENDPOINTS.md](./API-ENDPOINTS.md)
- **Flujo de Autenticación (diagramas):** [AUTH-FLOW.md](./AUTH-FLOW.md)

---

## 🔄 Cambios Recientes

### Agosto 2026
- ✅ Sesión con cookies httpOnly (`token_acceso`, `token_refresco`) en login/refresh; el guard acepta Bearer o cookie
- ✅ Endpoint `POST /autenticacion/cerrar-sesion` para limpiar cookies httpOnly (JS no puede borrarlas)
- ✅ Defensa CSRF: validación de `Origin` en peticiones de escritura autenticadas por cookie (403)
- ✅ Guía migrada de Angular a **React** (React 18 + Vite + React Router v6)
- ✅ Nuevo endpoint `GET /empleo/postulantes-vacante` para consultar postulantes por vacante
- ✅ Alias `GET /empleo/postulaciones` para compatibilidad
- ✅ Sistema de feature flags para control granular
- ✅ Guards reutilizables para autenticación y autorización

---

**¿Necesitas ayuda?** Consulta la documentación de Swagger o contacta al equipo de backend.
