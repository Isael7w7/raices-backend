# 🔐 Flujo de Autenticación Completo — Raíces para Florecer

**Última actualización:** 11 de agosto, 2026  
**Backend:** NestJS + Firebase Auth + Firestore

---

## 📋 Índice

1. [Resumen del Sistema](#-resumen-del-sistema)
2. [Flujo de Registro](#-flujo-de-registro)
3. [Flujo de Login](#-flujo-de-login)
4. [Flujo de Refresh Token](#-flujo-de-refresh-token)
5. [Flujo de Verificación de Token](#-flujo-de-verificación-de-token)
6. [Flujo de Control de Acceso](#-flujo-de-control-de-acceso)
7. [Flujo Completo End-to-End](#-flujo-completo-end-to-end)
8. [Diagrama de Estados del Token](#-diagrama-de-estados-del-token)
9. [Flujo de Excepciones](#-flujo-de-excepciones)
10. [Referencia de Código](#-referencia-de-código)

---

## 🏗️ Resumen del Sistema

### Arquitectura de Autenticación

```mermaid
graph TB
    subgraph Frontend["🖥️ Frontend (Cliente)"]
        UI[Interfaz de Usuario]
        AuthSvc[AuthService]
        TokenStore[(localStorage)]
        Interceptor[HTTP Interceptor]
    end

    subgraph Backend["⚙️ Backend (NestJS)"]
        AuthCtrl[Auth Controller]
        AuthSvc2[Auth Service]
        Guards[Guards Layer]
        FGuard[FirebaseAuthGuard]
        RGuard[RolesGuard]
        FeatGuard[FeatureGuard]
        Controllers[Controllers]
    end

    subgraph Firebase["🔥 Firebase"]
        AuthAPI[Firebase Auth REST API]
        AdminSDK[Firebase Admin SDK]
        Firestore[(Firestore)]
    end

    UI --> AuthSvc
    AuthSvc --> TokenStore
    AuthSvc --> Interceptor
    Interceptor -->|"Authorization: Bearer <token>"| AuthCtrl
    AuthCtrl --> AuthSvc2
    AuthSvc2 -->|"signInWithPassword"| AuthAPI
    AuthSvc2 -->|"createUser, verifyIdToken"| AdminSDK
    AuthSvc2 --> Firestore
    Controllers --> Guards
    Guards --> FGuard
    Guards --> RGuard
    Guards --> FeatGuard
    FGuard -->|"verifyIdToken()"| AdminSDK
    FGuard --> Firestore
```

### Componentes Clave

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| **AuthService** | `src/modules/auth/auth.service.ts` | Lógica de negocio: registro, login, refresh |
| **FirebaseAuthGuard** | `src/common/guards/firebase-auth.guard.ts` | Verificar token y poblar `request.user` |
| **RolesGuard** | `src/common/guards/roles.guard.ts` | Verificar rol del usuario |
| **FeatureGuard** | `src/common/guards/feature.guard.ts` | Verificar features habilitadas |
| **Firebase Auth REST API** | Externo | Autenticar credenciales, generar tokens |
| **Firebase Admin SDK** | Externo | Verificar tokens, gestionar usuarios |

---

## 📝 Flujo de Registro

```mermaid
sequenceDiagram
    participant U as 👤 Usuario
    participant F as 🖥️ Frontend
    participant A as ⚙️ AuthController
    participant S as 📦 AuthService
    participant FA as 🔥 Firebase Auth API
    participant AS as 🔧 Firebase Admin SDK
    participant DB as 💾 Firestore
    participant E as 📧 EmailService

    Note over U,E: ══════════════════════════════════════<br/>FLUJO DE REGISTRO<br/>══════════════════════════════════════

    U->>F: 1. Llenar formulario de registro
    F->>A: POST /autenticacion/registro

    A->>S: 2. Validar datos del DTO
    
    alt Rol = PCD con tutorId
        S->>DB: 3a. Verificar que tutor existe y está activo
        DB-->>S: Tutor encontrado
    end

    alt Rol = Institución
        S->>S: 3b. Verificar que categoria esté presente
    end

    S->>DB: 4. Verificar que email no exista
    DB-->>S: Email disponible

    S->>FA: 5. createUser() en Firebase Auth
    FA-->>S: UID del nuevo usuario

    Note over S,DB: ════════════════════════════════<br/>ESCRITURA ATÓMICA (batch)<br/>═════════════════════════════════

    S->>S: 6. Preparar datos del perfil
    S->>S: 7. Preparar datos de institución (si aplica)

    alt Rol = Institución
        S->>DB: 8. batch.set(perfiles/{uid}) + batch.set(instituciones/{uid})
    else Otros roles
        S->>DB: 8. batch.set(perfiles/{uid})
    end

    alt batch.commit() falla
        S->>AS: 9. deleteUser(uid) para rollback
        AS-->>S: Rollback completado
        S-->>A: Error propagado
        A-->>F: 500 Error
    else batch.commit() exitoso
        S->>DB: 10. Registrar dependiente (si PCD con tutor)
        
        Note over S,E: ════════════════════════════════<br/>TAREAS ASÍNCRONAS<br/>═════════════════════════════════
        
        S-)E: 11. Enviar email de bienvenida (async)
        S--)S: 12. Incrementar métricas de analytics (async)

        S-->>A: { usuario, requiereInicioSesion: true }
        A-->>F: 201 Created
        F-->>U: ✅ Registro exitoso → Redirigir a login
    end
```

### Puntos Clave del Registro

```
┌─────────────────────────────────────────────────────────────────┐
│                     PUNTOS CLAVE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ❌ NO retorna tokens → obliga a hacer login después         │
│     Razón: Un custom token de Firebase ≠ ID token               │
│     verifyIdToken() rechaza custom tokens                       │
│                                                                 │
│  2. ✅ Escritura atómica con batch()                            │
│     Si falla → rollback (elimina usuario de Firebase Auth)      │
│                                                                 │
│  3. ✅ Validación de duplicados ANTES de crear usuario           │
│     Busca en Firestore antes de llamar a createUser()           │
│                                                                 │
│  4. ✅ Email de bienvenida se envía de forma asíncrona           │
│     No bloquea la respuesta al usuario                          │
│                                                                 │
│  5. ✅ Métricas se incrementan de forma asíncrona                │
│     No afecta la performance del registro                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Flujo de Login

```mermaid
sequenceDiagram
    participant U as 👤 Usuario
    participant F as 🖥️ Frontend
    participant A as ⚙️ AuthController
    participant S as 📦 AuthService
    participant REST as 🌐 Firebase REST API
    participant AS as 🔧 Firebase Admin SDK
    participant DB as 💾 Firestore

    Note over U,DB: ══════════════════════════════════════<br/>FLUJO DE LOGIN<br/>══════════════════════════════════════

    U->>F: 1. Ingresar email y contraseña
    F->>A: POST /autenticacion/inicio-sesion

    A->>S: 2. login({ email, password })

    S->>REST: 3. signInWithPassword(email, password)
    
    alt Credenciales incorrectas
        REST-->>S: ERROR: EMAIL_NOT_FOUND / INVALID_PASSWORD
        S-->>A: 401 "Credenciales incorrectas"
        A-->>F: Error
        F-->>U: ❌ Credenciales incorrectas
    else Cuenta desactivada
        REST-->>S: ERROR: USER_DISABLED
        S-->>A: 401 "Cuenta desactivada"
        A-->>F: Error
        F-->>U: ❌ Cuenta desactivada
    else Credenciales válidas
        REST-->>S: 4. { idToken, refreshToken }
    end

    S->>AS: 5. verifyIdToken(idToken)
    AS-->>S: Token decodificado { uid, email, ... }

    S->>DB: 6. Obtener perfil del usuario
    DB-->>S: Documento del perfil

    alt Perfil no existe
        S-->>A: 401 "Usuario no encontrado"
    else Cuenta desactivada
        S-->>A: 401 "Cuenta desactivada"
    else Todo OK
        S-->>A: 7. Respuesta con tokens y usuario
    end

    A-->>F: 200 OK
    F->>F: 8. Guardar tokens en localStorage
    
    Note over F: localStorage:<br/>tokenAcceso = idToken<br/>tokenRefresco = refreshToken<br/>usuario = { id, email, rol, ... }
    
    F-->>U: ✅ Login exitoso → Redirigir al dashboard
```

### Respuesta del Login

```json
{
  "tokenAcceso": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenRefresco": "AMf9BxSj...",
  "expiraEn": 3600,
  "usuario": {
    "id": "abc123",
    "email": "usuario@ejemplo.com",
    "rol": "pcd",
    "nombreCompleto": "Juan Pérez",
    "tutorId": null,
    "institucionId": null,
    "features": {
      "chat": true,
      "postulaciones": true,
      "comunidad": true,
      "resenas": true,
      "descubrimiento": true,
      "favoritos": true,
      "multimedia": true
    }
  }
}
```

### Flujo de Almacenamiento en Frontend

```mermaid
graph LR
    subgraph "Después del Login"
        A[Respuesta API] --> B[tokenAcceso]
        A --> C[tokenRefresco]
        A --> D[usuario]
        
        B --> E[(localStorage<br/>tokenAcceso)]
        C --> F[(localStorage<br/>tokenRefresco)]
        D --> G[(localStorage<br/>usuario)]
        
        E --> H[HTTP Interceptor]
        F --> H
        G --> H
    end
    
    subgraph "En cada petición"
        H -->|"Authorization: Bearer tokenAcceso"| I[Backend API]
    end
```

---

## 🔄 Flujo de Refresh Token

```mermaid
sequenceDiagram
    participant F as 🖥️ Frontend
    participant I as 🔄 HTTP Interceptor
    participant A as ⚙️ AuthController
    participant S as 📦 AuthService
    participant REST as 🌐 Firebase SecureToken API
    participant DB as 💾 Firestore

    Note over F,DB: ══════════════════════════════════════<br/>FLUJO DE REFRESH TOKEN<br/>══════════════════════════════════════

    Note over F: El token expira después de 1 hora<br/>(3600 segundos)

    alt Renovación programada (5 min antes)
        F->>F: 1. setTimeout() se ejecuta
        F->>A: POST /autenticacion/renovar-token
    else Error 401 en petición
        F->>I: 2. Respuesta 401 recibida
        I->>I: 3. Interceptor detecta 401
        I->>A: POST /autenticacion/renovar-token
    end

    A->>S: 4. refresh(tokenRefresco)
    
    S->>REST: 5. POST /token (grant_type=refresh_token)
    
    alt Refresh token inválido
        REST-->>S: Error
        S-->>A: 401 "Refresh token inválido o expirado"
        A-->>F: Error
        F->>F: 6. logout() → Limpiar localStorage
        F-->>F: Redirigir a /login
    else Refresh token válido
        REST-->>S: 7. { id_token, refresh_token, user_id }
    end

    S->>DB: 8. Verificar que usuario existe y está activo
    
    alt Usuario desactivado
        S-->>A: 401 "Cuenta desactivada"
    else Todo OK
        S-->>A: 9. Nuevos tokens
    end

    A-->>F: 200 OK
    F->>F: 10. Actualizar localStorage con nuevos tokens
    F->>F: 11. Programar próxima renovación
```

### Estrategia de Renovación en Frontend

```typescript
// 🔄 Renovación programada (recomendada)
// Se ejecuta 5 minutos ANTES de que el token expire

programarRenovacion(expiraEn: number): void {
  // Renovar 5 minutos antes de expirar
  const tiempoRenovacion = (expiraEn - 300) * 1000; // milisegundos
  
  setTimeout(() => {
    this.renovarToken();
  }, tiempoRenovacion);
}

// 🔄 Renovación reactiva (fallback)
// Se ejecuta cuando se recibe un error 401

intercept(request, next) {
  return next.handle(request).pipe(
    catchError(error => {
      if (error.status === 401 && !request.url.includes('login')) {
        return this.renovarYReintentar(request, next);
      }
      return throwError(error);
    })
  );
}
```

---

## 🛡️ Flujo de Verificación de Token

```mermaid
flowchart TD
    Start["📥 Request entrante<br/>GET /api/empleo"] --> Header{"Header<br/>Authorization?"}
    
    Header -->|"❌ No existe"| Err1["❌ 401<br/>Token de autenticación requerido"]
    Header -->|"⚠️ No empieza con 'Bearer'"| Err1
    Header -->|"✅ Bearer <token>"| Extract["Extraer token"]
    
    Extract --> Verify["🔧 verifyIdToken(token)<br/>Firebase Admin SDK"]
    
    Verify -->|"❌ Token inválido"| Err2["❌ 401<br/>Token inválido o expirado"]
    Verify -->|"❌ Token expirado"| Err2
    Verify -->|"✅ Token válido"| Lookup["💾 Buscar perfil en Firestore<br/>perfiles/{uid}"]
    
    Lookup -->|"❌ Perfil no existe"| Err3["❌ 401<br/>Usuario no encontrado"]
    Lookup -->|"⚠️ perfil.activo = false"| Err4["❌ 401<br/>Cuenta desactivada"]
    Lookup -->|"✅ Perfil encontrado y activo"| Normalize["🔄 Normalizar rol<br/>'institution' → 'institucion'"]
    
    Normalize --> Populate["📋 Poblar request.user"]
    
    Populate --> UserData["request.user = {<br/>  id: uid,<br/>  email: email,<br/>  rol: rol,<br/>  nombreCompleto: nombre,<br/>  features: features<br/>}"]
    
    UserData --> Pass["✅ canActivate = true<br/>Continuar al siguiente guard"]
    
    Pass --> NextGuard{"¿Hay más<br/>Guards?"}
    
    NextGuard -->|"Sí"| RolesGuard["RolesGuard"]
    NextGuard -->|"No"| Controller["→ Controller"]
    
    RolesGuard --> RoleCheck{"Rol permitido?"}
    RoleCheck -->|"❌ No"| Err5["❌ 403<br/>Rol insuficiente"]
    RoleCheck -->|"✅ Sí"| FeatureGuard["FeatureGuard"]
    
    FeatureGuard --> FeatureCheck{"Feature habilitada?"}
    FeatureCheck -->|"❌ No"| Err6["❌ 403<br/>Feature desactivada"]
    FeatureCheck -->|"✅ Sí"| Controller

    style Err1 fill:#ffcccc,stroke:#cc0000
    style Err2 fill:#ffcccc,stroke:#cc0000
    style Err3 fill:#ffcccc,stroke:#cc0000
    style Err4 fill:#ffcccc,stroke:#cc0000
    style Err5 fill:#ffcccc,stroke:#cc0000
    style Err6 fill:#ffcccc,stroke:#cc0000
    style Controller fill:#ccffcc,stroke:#00cc00
    style Pass fill:#ccffcc,stroke:#00cc00
```

### Datos del Token Firebase (JWT)

```json
{
  "iss": "https://securetoken.google.com/raices-499122",
  "sub": "abc123",
  "aud": "raices-499122",
  "exp": 1786516800,
  "iat": 1786513200,
  "auth_time": 1786513200,
  "uid": "abc123",
  "email": "usuario@ejemplo.com",
  "email_verified": false
}
```

---

## 🎭 Flujo de Control de Acceso

### RolesGuard

```mermaid
flowchart TD
    Start["📥 Request con<br/>request.user populated"] --> CheckMeta{"¿Endpoint tiene<br/>decorador @Roles()?"}
    
    CheckMeta -->|"No tiene"| Pass["✅ Sin restricción<br/>Acceso permitido"]
    CheckMeta -->|"Tiene @Roles(['admin'])"| GetUser["Obtener user.rol"]
    
    GetUser --> CheckRole{"user.rol ∈<br/>roles permitidos?"}
    
    CheckRole -->|"admin ∈ ['admin']"| Pass
    CheckRole -->|"institucion ∈ ['institucion', 'admin']"| Pass
    CheckRole -->|"pcd ∈ ['pcd', 'tutor']"| Pass
    CheckRole -->|"❌ No está en la lista"| Error["❌ 403 Forbidden<br/>Rol insuficiente"]

    style Pass fill:#ccffcc,stroke:#00cc00
    style Error fill:#ffcccc,stroke:#cc0000
```

### Ejemplo de Uso

```typescript
// ✅ Solo administradores
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Get('estadisticas')
obtenerEstadisticas() { ... }

// ✅ Instituciones y administradores
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('institucion', 'admin')
@Post()
crearVacante() { ... }

// ✅ Usuarios PCD y tutores
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('pcd', 'tutor')
@Post(':id/postularse')
postularse() { ... }
```

### FeatureGuard

```mermaid
flowchart TD
    Start["📥 Request con<br/>request.user populated"] --> CheckMeta{"¿Endpoint tiene<br/>decorador @Feature()?"}
    
    CheckMeta -->|"No tiene"| Pass["✅ Sin restricción<br/>Acceso permitido"]
    CheckMeta -->|"Tiene @Feature('chat')"| CheckAdmin{"¿user.rol === 'admin'?"}
    
    CheckAdmin -->|"✅ Es admin"| Pass["✅ Admin siempre<br/>tiene acceso"]
    CheckAdmin -->|"❌ No es admin"| GetUserFeatures["Obtener user.features"]
    
    GetUserFeatures --> CheckFeature{"features['chat']<br/>=== false?"}
    
    CheckFeature -->|"false"| Error["❌ 403 Forbidden<br/>Feature desactivada"]
    CheckFeature -->|"true o undefined"| Pass

    style Pass fill:#ccffcc,stroke:#00cc00
    style Error fill:#ffcccc,stroke:#cc0000
```

### Ejemplo de Uso

```typescript
// ✅ Requiere feature 'chat' habilitada
@UseGuards(JwtAuthGuard, FeatureGuard)
@Feature('chat')
@Post('enviar/:userId')
enviarMensaje() { ... }

// ✅ Requiere feature 'postulaciones' habilitada
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@Roles('institucion', 'admin')
@Feature('postulaciones')
@Get('postulantes-vacante')
obtenerPostulantes() { ... }
```

---

## 🔗 Flujo Completo End-to-End

```mermaid
sequenceDiagram
    participant U as 👤 Usuario
    participant F as 🖥️ Frontend
    participant I as 🔄 Interceptor
    participant A as ⚙️ AuthController
    participant S as 📦 AuthService
    participant G1 as 🛡️ FirebaseAuthGuard
    participant G2 as 🎭 RolesGuard
    participant G3 as ✨ FeatureGuard
    participant C as 📡 Controller
    participant SVC as 💼 Service
    participant DB as 💾 Firestore

    Note over U,DB: ════════════════════════════════════════════════<br/>SESIÓN COMPLETA: Login → Crear Vacante<br/>═══════════════════════════════════════════════

    rect rgb(240, 248, 255)
        Note over U,A: FASE 1: AUTENTICACIÓN
        U->>F: 1. Ingresar credenciales
        F->>A: POST /autenticacion/inicio-sesion
        A->>S: login()
        S-->>A: { tokenAcceso, tokenRefresco, usuario }
        A-->>F: 200 OK
        F->>F: 2. Guardar tokens en localStorage
    end

    rect rgb(255, 248, 240)
        Note over U,C: FASE 2: PETICIÓN AUTENTICADA
        U->>F: 3. Click "Crear Vacante"
        F->>I: POST /api/empleo
        I->>I: 4. Agregar Authorization header
        I->>G1: Bearer eyJhbGci...
    end

    rect rgb(240, 255, 240)
        Note over G1,C: FASE 3: VERIFICACIÓN DE GUARDS
        G1->>G1: 5. verifyIdToken()
        G1->>DB: 6. Obtener perfil
        G1->>G1: 7. Poblar request.user
        G1-->>G2: ✅ Token válido

        G2->>G2: 8. Verificar @Roles(['institucion', 'admin'])
        G2->>G2: user.rol === 'institucion'
        G2-->>G3: ✅ Rol correcto

        G3->>G3: 9. Verificar @Feature('postulaciones')
        G3->>G3: features.postulaciones === true
        G3-->>C: ✅ Feature habilitada
    end

    rect rgb(248, 240, 255)
        Note over C,DB: FASE 4: EJECUCIÓN
        C->>SVC: 10. crearVacante(dto)
        SVC->>DB: 11. Verificar institución aprobada
        DB-->>SVC: { activa: true, verificada: true }
        SVC->>DB: 12. Crear vacante
        DB-->>SVC: Vacante creada
        SVC-->>C: Vacante
        C-->>F: 201 Created
        F-->>U: ✅ Vacante creada exitosamente
    end
```

---

## 📊 Diagrama de Estados del Token

```mermaid
stateDiagram-v2
    [*] --> NoAuth: App inicia

    NoAuth --> Authenticating: Usuario hace login
    Authenticating --> Active: Login exitoso<br/>(tokenAcceso + tokenRefresco)
    Authenticating --> NoAuth: Login fallido

    state Active {
        [*] --> Fresh: Token recién creado
        Fresh --> NearExpiry: 55 minutos pasan
        NearExpiry --> Refreshing: Renovación programada<br/>(5 min antes de expirar)
        
        state Refreshing {
            [*] --> RequestSent: POST /renovar-token
            RequestSent --> Success: 200 OK
            RequestSent --> Failed: 401 Error
        }
        
        Refreshing --> Fresh: Success<br/>(nuevos tokens)
        Refreshing --> Expired: Failed
    }

    Active --> Expired: Token expira<br/>(1 hora)
    Active --> Expired: Refresh token inválido

    state Expired {
        [*] --> Detecting: Error 401 recibido
        Detecting --> AttemptRefresh: Interceptor detecta 401
        AttemptRefresh --> RefreshFailed: Refresh fallido
        RefreshFailed --> [*]
    }

    Expired --> NoAuth: Logout automático<br/>(limpiar localStorage)
    
    Active --> NoAuth: Logout manual

    NoAuth --> [*]
```

### Tiempos de Expiración

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIEMPOS DE TOKEN                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  tokenAcceso (ID Token):                                        │
│  ├── Expira en: 1 hora (3600 segundos)                          │
│  ├── Renovar: 5 minutos antes de expirar                        │
│  └── Uso: Authorization: Bearer <token>                         │
│                                                                 │
│  tokenRefresco:                                                 │
│  ├── Expira en: ~30 días (varía según Firebase)                 │
│  ├── Se renueva automáticamente al usarlo                       │
│  └── Uso: POST /autenticacion/renovar-token                     │
│                                                                 │
│  Frontend Strategy:                                             │
│  ├── Primary: Renovación programada (setTimeout)                │
│  └── Fallback: Renovación reactiva (intercept 401)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚠️ Flujo de Excepciones

```mermaid
flowchart TD
    Start["Request entrante"] --> AuthCheck{"¿Header Authorization<br/>válido?"}
    
    AuthCheck -->|"❌ No"| E1["401 Token de autenticación requerido"]
    AuthCheck -->|"✅ Sí"| TokenCheck{"¿Token válido<br/>y no expirado?"}
    
    TokenCheck -->|"❌ Inválido/Expirado"| E2["401 Token inválido o expirado"]
    TokenCheck -->|"✅ Válido"| UserCheck{"¿Usuario existe<br/>en Firestore?"}
    
    UserCheck -->|"❌ No existe"| E3["401 Usuario no encontrado"]
    UserCheck -->|"✅ Existe"| ActiveCheck{"¿perfil.activo<br/>=== true?"}
    
    ActiveCheck -->|"❌ false"| E4["401 Cuenta desactivada"]
    ActiveCheck -->|"✅ true"| RoleCheck{"¿Endpoint tiene<br/>@Roles()?"}
    
    RoleCheck -->|"No"| FeatureCheck
    RoleCheck -->|"Sí"| RoleMatch{"user.rol ∈ roles?"}
    
    RoleMatch -->|"❌ No"| E5["403 Rol insuficiente"]
    RoleMatch -->|"✅ Sí"| FeatureCheck{"¿Endpoint tiene<br/>@Feature()?"}
    
    FeatureCheck -->|"No"| OwnerCheck
    FeatureCheck -->|"Sí"| AdminBypass{"¿Es admin?"}
    
    AdminBypass -->|"✅ Sí"| OwnerCheck
    AdminBypass -->|"❌ No"| FeatureEnabled{"features[feature]<br/>=== true?"}
    
    FeatureEnabled -->|"❌ false"| E6["403 Feature desactivada"]
    FeatureEnabled -->|"✅ true"| OwnerCheck{"¿Requiere<br/>propiedad?"}
    
    OwnerCheck -->|"No"| Success["✅ Acceso permitido"]
    OwnerCheck -->|"Sí"| OwnerMatch{"¿Es propietario<br/>del recurso?"}
    
    OwnerMatch -->|"❌ No"| E7["403 No tienes permisos"]
    OwnerMatch -->|"✅ Sí"| Success

    style E1 fill:#ffcccc,stroke:#cc0000
    style E2 fill:#ffcccc,stroke:#cc0000
    style E3 fill:#ffcccc,stroke:#cc0000
    style E4 fill:#ffcccc,stroke:#cc0000
    style E5 fill:#ffcccc,stroke:#cc0000
    style E6 fill:#ffcccc,stroke:#cc0000
    style E7 fill:#ffcccc,stroke:#cc0000
    style Success fill:#ccffcc,stroke:#00cc00
```

### Tabla de Errores Comunes

| Código | Mensaje | Causa | Solución |
|--------|---------|-------|----------|
| `401` | Token de autenticación requerido | No se envió header | Agregar `Authorization: Bearer <token>` |
| `401` | Token inválido o expirado | Token expirado o corrupto | Renovar token con refresh |
| `401` | Usuario no encontrado | Perfil borrado de Firestore | Re-login necesario |
| `401` | Cuenta desactivada | Admin desactivó la cuenta | Contactar soporte |
| `403` | Rol insuficiente | Usuario no tiene el rol requerido | Verificar roles del usuario |
| `403` | Feature desactivada | Feature no habilitada para el usuario | Contactar tutor/admin |

---

## 📚 Referencia de Código

### FirebaseAuthGuard — Verificación de Token

```typescript
// src/common/guards/firebase-auth.guard.ts
async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest()
  const authHeader = request.headers['authorization']

  // 1. Verificar que existe el header
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedException('Token de autenticación requerido')
  }

  // 2. Extraer token
  const token = authHeader.split(' ')[1]

  try {
    // 3. Verificar con Firebase Admin SDK
    const decodedToken = await getAuth().verifyIdToken(token)

    // 4. Buscar perfil en Firestore
    const doc = await this.db.collection('perfiles').doc(decodedToken.uid).get()
    if (!doc.exists) throw new UnauthorizedException('Usuario no encontrado')

    const perfil = doc.data()
    if (perfil.activo === false) throw new UnauthorizedException('Cuenta desactivada')

    // 5. Normalizar rol legacy
    const rol = perfil.rol === 'institution' ? 'institucion' : perfil.rol

    // 6. Poblar request.user
    request.user = {
      id: decodedToken.uid,
      email: perfil.email,
      rol,
      nombreCompleto: perfil.nombreCompleto,
      features: perfil.features,
    }

    return true
  } catch (e) {
    if (e instanceof UnauthorizedException) throw e
    throw new UnauthorizedException('Token inválido o expirado')
  }
}
```

### RolesGuard — Verificación de Rol

```typescript
// src/common/guards/roles.guard.ts
canActivate(ctx: ExecutionContext): boolean {
  // Obtener roles requeridos del decorador @Roles()
  const roles = this.reflector.getAllAndOverride<string[]>(
    'roles', 
    [ctx.getHandler(), ctx.getClass()]
  )
  
  // Si no hay restricción, permitir acceso
  if (!roles || roles.length === 0) return true

  const { user } = ctx.switchToHttp().getRequest()
  
  // Verificar que el usuario tiene uno de los roles permitidos
  if (!user || !roles.includes(user.rol)) {
    throw new ForbiddenException('Rol insuficiente')
  }

  return true
}
```

### FeatureGuard — Verificación de Feature

```typescript
// src/common/guards/feature.guard.ts
canActivate(ctx: ExecutionContext): boolean {
  // Obtener feature requerida del decorador @Feature()
  const feature = this.reflector.getAllAndOverride<string>(
    'feature', 
    [ctx.getHandler(), ctx.getClass()]
  )
  
  // Si no hay restricción, permitir acceso
  if (!feature) return true

  const request = ctx.switchToHttp().getRequest()
  const user = request.user

  // Admin siempre tiene acceso
  if (user?.rol === 'admin') return true

  const features = user?.features ?? FEATURES_POR_DEFECTO

  // Verificar que la feature está habilitada
  if (features[feature] === false) {
    throw new ForbiddenException(
      `Funcionalidad "${feature}" desactivada para tu cuenta.`
    )
  }

  return true
}
```

---

## 🎯 Resumen Visual

```mermaid
graph LR
    subgraph "Paso 1: Login"
        A[Email + Password] -->|POST /login| B[tokenAcceso<br/>tokenRefresco]
    end

    subgraph "Paso 2: Guardar"
        B -->|localStorage| C[(Tokens<br/>Guardados)]
    end

    subgraph "Paso 3: Request"
        C -->|Authorization header| D[API Request]
    end

    subgraph "Paso 4: Verificar"
        D -->|FirebaseAuthGuard| E[request.user]
        E -->|RolesGuard| F{Rol OK?}
        E -->|FeatureGuard| G{Feature OK?}
    end

    subgraph "Paso 5: Ejecutar"
        F -->|✅| H[Controller]
        G -->|✅| H
    end

    subgraph "Paso 6: Renovar"
        C -->|5 min antes expiración| I[Refresh Token]
        I -->|Nuevos tokens| B
    end

    style A fill:#e1f5fe
    style B fill:#c8e6c9
    style C fill:#fff9c4
    style H fill:#c8e6c9
```

---

**¿Necesitas más detalles sobre algún flujo específico?** Consulta la [GUÍA DE INTEGRACIÓN FRONTEND](./FRONTEND-INTEGRATION-GUIDE.md) para ejemplos de código completos.
