# 🚀 Guía de Integración Frontend — Raíces para Florecer

**Última actualización:** 11 de agosto, 2026  
**Backend API:** `https://raices-backend-jftu6lrbda-uc.a.run.app/api`  
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
│  (Cliente)  │◀────│  (NestJS)   │◀────│  (Auth)     │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │  1. Login         │                   │
       │──────────────────▶│  2. Verificar     │
       │                   │──────────────────▶│
       │                   │  3. ID Token      │
       │                   │◀──────────────────│
       │  4. { tokenAcceso, tokenRefresco }    │
       │◀──────────────────│                   │
       │                   │                   │
       │  5. Request API   │                   │
       │  Authorization:   │                   │
       │  Bearer <token>   │                   │
       │──────────────────▶│  6. Verificar     │
       │                   │  token con        │
       │                   │  verifyIdToken()  │
       │                   │──────────────────▶│
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

---

## 🔐 Autenticación

### 1. Servicio de Autenticación

```typescript
// auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { Router } from '@angular/router';

interface LoginResponse {
  tokenAcceso: string;
  tokenRefresco: string;
  expiraEn: number;
  usuario: Usuario;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = 'https://raices-backend-jftu6lrbda-uc.a.run.app/api';
  private readonly TOKEN_KEY = 'tokenAcceso';
  private readonly REFRESH_KEY = 'tokenRefresco';
  private readonly USER_KEY = 'usuario';
  
  private usuarioActual$ = new BehaviorSubject<Usuario | null>(null);
  private tokenRefreshTimeout: any;

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.cargarSesion();
  }

  // =====================
  // MÉTODOS PÚBLICOS
  // =====================

  /**
   * Registrar nuevo usuario
   */
  async registro(datos: RegistroDto): Promise<void> {
    await this.http.post(`${this.API_URL}/autenticacion/registro`, datos)
      .toPromise();
    // El registro NO retorna tokens - debes hacer login después
  }

  /**
   * Iniciar sesión
   */
  async login(email: string, password: string): Promise<Usuario> {
    const response = await this.http.post<LoginResponse>(
      `${this.API_URL}/autenticacion/inicio-sesion`,
      { email, password }
    ).toPromise();

    this.guardarSesion(response!);
    this.programarRenovacion(response!.expiraEn);
    
    return response!.usuario;
  }

  /**
   * Cerrar sesión
   */
  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
    
    if (this.tokenRefreshTimeout) {
      clearTimeout(this.tokenRefreshTimeout);
    }
    
    this.usuarioActual$.next(null);
    this.router.navigate(['/login']);
  }

  /**
   * Obtener token actual
   */
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Obtener usuario actual
   */
  getUsuario(): Observable<Usuario | null> {
    return this.usuarioActual$.asObservable();
  }

  /**
   * Verificar si está autenticado
   */
  estaAutenticado(): boolean {
    const token = this.getToken();
    return token !== null && !this.tokenExpirado(token);
  }

  /**
   * Verificar si tiene un feature habilitado
   */
  tieneFeature(feature: keyof FeatureFlags): boolean {
    const usuario = this.usuarioActual$.value;
    return usuario?.features?.[feature] ?? false;
  }

  /**
   * Verificar si tiene uno de los roles requeridos
   */
  tieneRol(...roles: string[]): boolean {
    const usuario = this.usuarioActual$.value;
    return usuario ? roles.includes(usuario.rol) : false;
  }

  // =====================
  // MÉTODOS PRIVADOS
  // =====================

  private guardarSesion(response: LoginResponse): void {
    localStorage.setItem(this.TOKEN_KEY, response.tokenAcceso);
    localStorage.setItem(this.REFRESH_KEY, response.tokenRefresco);
    localStorage.setItem(this.USER_KEY, JSON.stringify(response.usuario));
    
    this.usuarioActual$.next(response.usuario);
  }

  private cargarSesion(): void {
    const token = localStorage.getItem(this.TOKEN_KEY);
    const usuarioStr = localStorage.getItem(this.USER_KEY);
    
    if (token && usuarioStr && !this.tokenExpirado(token)) {
      const usuario = JSON.parse(usuarioStr);
      this.usuarioActual$.next(usuario);
      this.programarRenovacion(this.calcularTiempoRestante(token));
    }
  }

  private async renovarToken(): Promise<void> {
    const tokenRefresco = localStorage.getItem(this.REFRESH_KEY);
    if (!tokenRefresco) {
      this.logout();
      return;
    }

    try {
      const response = await this.http.post<LoginResponse>(
        `${this.API_URL}/autenticacion/renovar-token`,
        { tokenRefresco }
      ).toPromise();

      this.guardarSesion(response!);
      this.programarRenovacion(response!.expiraEn);
    } catch (error) {
      console.error('Error renovando token:', error);
      this.logout();
    }
  }

  private programarRenovacion(expiraEn: number): void {
    // Renovar 5 minutos antes de expirar
    const tiempoRenovacion = (expiraEn - 300) * 1000;
    
    if (this.tokenRefreshTimeout) {
      clearTimeout(this.tokenRefreshTimeout);
    }
    
    this.tokenRefreshTimeout = setTimeout(
      () => this.renovarToken(),
      tiempoRenovacion
    );
  }

  private tokenExpirado(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiraEn = payload.exp * 1000;
      return Date.now() >= expiraEn;
    } catch {
      return true;
    }
  }

  private calcularTiempoRestante(token: string): number {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiraEn = payload.exp * 1000;
      return Math.max(0, (expiraEn - Date.now()) / 1000);
    } catch {
      return 0;
    }
  }
}
```

---

### 2. Interceptor HTTP (Agregar Token Automáticamente)

```typescript
// auth.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(private authService: AuthService) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    
    // Agregar token a las peticiones
    const token = this.authService.getToken();
    
    if (token) {
      request = this.agregarToken(request, token);
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        // Si es error 401 y no es el login, intentar refresh
        if (error.status === 401 && !request.url.includes('inicio-sesion')) {
          return this.manejarError401(request, next);
        }
        return throwError(() => error);
      })
    );
  }

  private agregarToken(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  private manejarError401(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return this.renovarToken().pipe(
        switchMap((nuevoToken: string) => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(nuevoToken);
          return next.handle(this.agregarToken(request, nuevoToken));
        }),
        catchError((error) => {
          this.isRefreshing = false;
          this.authService.logout();
          return throwError(() => error);
        })
      );
    }

    // Esperar a que se renueve el token
    return this.refreshTokenSubject.pipe(
      filter(token => token != null),
      take(1),
      switchMap(token => {
        return next.handle(this.agregarToken(request, token));
      })
    );
  }

  private renovarToken(): Observable<string> {
    // Implementar lógica de renovación
    // similar a AuthService.renovarToken()
    return new Observable();
  }
}
```

---

### 3. Configuración en Angular

```typescript
// app.module.ts
import { NgModule } from '@angular/core';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { AuthInterceptor } from './auth.interceptor';

@NgModule({
  imports: [
    HttpClientModule,
    // ... otros imports
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
```

---

## 🛡️ Sistema de Permisos

### 1. Estructura de Features

```typescript
// feature-flags.ts
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
  multimedia: true
};
```

### 2. Guard de Features (Angular)

```typescript
// feature.guard.ts
import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router
} from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class FeatureGuard implements CanActivate {
  
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    
    const featureRequerida = route.data['feature'] as keyof FeatureFlags;
    
    if (!featureRequerida) {
      return true; // No se requiere feature específica
    }

    if (this.authService.tieneFeature(featureRequerida)) {
      return true;
    }

    // Redirigir a página de "acceso denegado"
    this.router.navigate(['/acceso-denegado'], {
      queryParams: { feature: featureRequerida }
    });
    
    return false;
  }
}
```

### 3. Guard de Roles (Angular)

```typescript
// role.guard.ts
import { Injectable } from '@angular/core';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  Router
} from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {
  
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const rolesRequeridos = route.data['roles'] as string[];
    
    if (!rolesRequeridos || rolesRequeridos.length === 0) {
      return true;
    }

    if (this.authService.tieneRol(...rolesRequeridos)) {
      return true;
    }

    this.router.navigate(['/acceso-denegado']);
    return false;
  }
}
```

### 4. Configuración de Rutas

```typescript
// app-routing.module.ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { FeatureGuard } from './feature.guard';
import { RoleGuard } from './role.guard';

const routes: Routes = [
  // Públicas
  { path: 'login', component: LoginComponent },
  { path: 'registro', component: RegistroComponent },
  
  // Protegidas - Cualquier usuario autenticado
  {
    path: 'perfil',
    component: PerfilComponent,
    canActivate: [AuthGuard]
  },
  
  // Protegidas - Requieren feature específica
  {
    path: 'empleo',
    canActivate: [AuthGuard, FeatureGuard],
    data: { feature: 'postulaciones' },
    children: [
      {
        path: '',
        component: ListaVacantesComponent
      },
      {
        path: ':id',
        component: DetalleVacanteComponent
      }
    ]
  },
  
  // Protegidas - Requieren rol específico
  {
    path: 'institucion',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['institucion', 'admin'] },
    children: [
      {
        path: 'mis-vacantes',
        component: MisVacantesComponent
      },
      {
        path: 'postulantes',
        component: PostulantesComponent
      }
    ]
  },
  
  // Admin
  {
    path: 'admin',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['admin'] },
    children: [
      {
        path: '',
        component: DashboardAdminComponent
      },
      {
        path: 'usuarios',
        component: UsuariosAdminComponent
      },
      {
        path: 'instituciones',
        component: InstitucionesAdminComponent
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
```

---

### 5. Componente con Verificación de Feature

```typescript
// empleo.component.ts
import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-empleo',
  template: `
    <!-- Header -->
    <header>
      <h1>Bolsa de Trabajo Inclusivo</h1>
    </header>

    <!-- Solo mostrar si tiene la feature -->
    <ng-container *ngIf="authService.tieneFeature('postulaciones')">
      
      <!-- Botón para instituciones -->
      <button 
        *ngIf="authService.tieneRol('institucion', 'admin')"
        (click)="crearVacante()">
        + Crear Vacante
      </button>

      <!-- Lista de vacantes -->
      <div class="vacantes">
        <div *ngFor="let vacante of vacantes" class="vacante-card">
          <h3>{{ vacante.titulo }}</h3>
          <p>{{ vacante.descripcion }}</p>
          <p>{{ vacante.institucionNombre }}</p>
          
          <!-- Botón postularse solo para PCD/Tutor -->
          <button 
            *ngIf="authService.tieneRol('pcd', 'tutor')"
            (click)="postularse(vacante.id)">
            Postularme
          </button>
          
          <!-- Ver postulantes solo para Institución -->
          <button 
            *ngIf="authService.tieneRol('institucion', 'admin')"
            (click)="verPostulantes(vacante.id)">
            Ver Postulantes ({{ vacante.totalPostulantes }})
          </button>
        </div>
      </div>
    </ng-container>

    <!-- Mensaje si no tiene feature -->
    <div *ngIf="!authService.tieneFeature('postulaciones')" 
         class="acceso-denegado">
      <p>Esta función no está disponible para tu cuenta.</p>
    </div>
  `
})
export class EmpleoComponent implements OnInit {
  vacantes: any[] = [];

  constructor(public authService: AuthService) {}

  ngOnInit(): void {
    this.cargarVacantes();
  }

  async cargarVacantes(): Promise<void> {
    // Lógica para cargar vacantes
  }

  async postularse(vacanteId: string): Promise<void> {
    // Lógica para postularse
  }

  verPostulantes(vacanteId: string): void {
    // Navegar a página de postulantes
  }

  crearVacante(): void {
    // Navegar a formulario de crear vacante
  }
}
```

---

### 6. Directiva de Feature

```typescript
// feature.directive.ts
import { Directive, Input, TemplateRef, ViewContainerRef } from '@angular/core';
import { AuthService } from './auth.service';

@Directive({
  selector: '[appFeature]'
})
export class FeatureDirective {
  
  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {}

  @Input() set appFeature(feature: string) {
    if (this.authService.tieneFeature(feature as any)) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    } else {
      this.viewContainer.clear();
    }
  }
}

// Uso en HTML:
// <ng-container *appFeature="'postulaciones'">
//   <button>Crear Vacante</button>
// </ng-container>
```

---

### 7. Directiva de Rol

```typescript
// role.directive.ts
import { Directive, Input, TemplateRef, ViewContainerRef } from '@angular/core';
import { AuthService } from './auth.service';

@Directive({
  selector: '[appRole]'
})
export class RoleDirective {
  
  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {}

  @Input() set appRole(roles: string | string[]) {
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    
    if (this.authService.tieneRol(...rolesArray)) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    } else {
      this.viewContainer.clear();
    }
  }
}

// Uso en HTML:
// <button *appRole="'institucion'">Crear Vacante</button>
// <button *appRole="['institucion', 'admin']">Administrar</button>
```

---

## 📡 Ejemplos de Integración

### 1. Obtener Postulantes de una Vacante

```typescript
// postulantes.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

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

@Injectable({
  providedIn: 'root'
})
export class PostulantesService {
  private readonly API_URL = 'https://raices-backend-jftu6lrbda-uc.a.run.app/api';

  constructor(private http: HttpClient) {}

  /**
   * Obtener postulantes de una vacante específica
   * Requiere: rol institucion o admin
   */
  obtenerPostulantesPorVacante(
    vacanteId: string,
    filtros?: {
      estado?: string;
      buscar?: string;
      page?: number;
      limite?: number;
    }
  ): Observable<RespuestaPostulantes> {
    
    let params = new HttpParams().set('vacanteId', vacanteId);
    
    if (filtros?.estado) {
      params = params.set('estado', filtros.estado);
    }
    if (filtros?.buscar) {
      params = params.set('buscar', filtros.buscar);
    }
    if (filtros?.page) {
      params = params.set('page', filtros.page.toString());
    }
    if (filtros?.limite) {
      params = params.set('limite', filtros.limite.toString());
    }

    return this.http.get<RespuestaPostulantes>(
      `${this.API_URL}/empleo/postulantes-vacante`,
      { params }
    );
  }

  /**
   * Alias: obtener postulantes (compatibilidad con frontend existente)
   */
  obtenerPostulacionesPorVacante(
    vacanteId: string,
    filtros?: any
  ): Observable<RespuestaPostulantes> {
    
    let params = new HttpParams().set('vacanteId', vacanteId);
    
    if (filtros) {
      Object.keys(filtros).forEach(key => {
        if (filtros[key] !== undefined && filtros[key] !== null) {
          params = params.set(key, filtros[key].toString());
        }
      });
    }

    return this.http.get<RespuestaPostulantes>(
      `${this.API_URL}/empleo/postulaciones`,
      { params }
    );
  }

  /**
   * Obtener todos los postulantes de MI institución
   */
  obtenerMisPostulantes(
    filtros?: {
      vacanteId?: string;
      estado?: string;
      buscar?: string;
      page?: number;
      limite?: number;
    }
  ): Observable<RespuestaPostulantes> {
    
    let params = new HttpParams();
    
    if (filtros) {
      Object.keys(filtros).forEach(key => {
        if (filtros[key as keyof typeof filtros] !== undefined) {
          params = params.set(key, filtros[key as keyof typeof filtros]!.toString());
        }
      });
    }

    return this.http.get<RespuestaPostulantes>(
      `${this.API_URL}/empleo/postulantes-institucion`,
      { params }
    );
  }

  /**
   * Cambiar estado de una postulación
   */
  cambiarEstado(
    postulacionId: string,
    estado: string,
    comentarios?: string
  ): Observable<any> {
    return this.http.patch(
      `${this.API_URL}/empleo/postulaciones/${postulacionId}/estado`,
      { estado, comentarios }
    );
  }
}
```

---

### 2. Componente de Postulantes

```typescript
// postulantes.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PostulantesService } from './postulantes.service';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-postulantes',
  template: `
    <div class="postulantes-container">
      <h2>Postulantes - {{ vacanteTitulo }}</h2>
      
      <!-- Filtros -->
      <div class="filtros">
        <select [(ngModel)]="filtroEstado" (change)="aplicarFiltros()">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aceptada">Aceptada</option>
          <option value="rechazada">Rechazada</option>
          <option value="en_revision">En revisión</option>
        </select>
        
        <input 
          type="text" 
          placeholder="Buscar por nombre o email..."
          [(ngModel)]="filtroBuscar"
          (keyup.enter)="aplicarFiltros()">
        
        <button (click)="aplicarFiltros()">Buscar</button>
      </div>

      <!-- Lista de postulantes -->
      <div class="lista-postulantes">
        <div *ngFor="let postulante of postulantes" class="postulante-card">
          <img 
            [src]="postulante.avatarUrl || 'assets/default-avatar.png'" 
            [alt]="postulante.nombreCompleto"
            class="avatar">
          
          <div class="info">
            <h3>{{ postulante.nombreCompleto }}</h3>
            <p>{{ postulante.email }}</p>
            <p class="fecha">
              Postuló: {{ postulante.fechaPostulacion | date:'medium' }}
            </p>
          </div>

          <div class="estado" [ngClass]="postulante.estado">
            {{ postulante.estado | titlecase }}
          </div>

          <div class="acciones">
            <button 
              *ngIf="postulante.estado === 'pendiente'"
              (click)="cambiarEstado(postulante.postulacionId, 'aceptada')">
              ✅ Aceptar
            </button>
            <button 
              *ngIf="postulante.estado === 'pendiente'"
              (click)="cambiarEstado(postulante.postulacionId, 'rechazada')">
              ❌ Rechazar
            </button>
            <button (click)="verDetalle(postulante)">
              👁️ Ver Detalle
            </button>
          </div>
        </div>
      </div>

      <!-- Paginación -->
      <div class="paginacion" *ngIf="totalPaginas > 1">
        <button 
          [disabled]="paginaActual === 1"
          (click)="cambiarPagina(paginaActual - 1)">
          ← Anterior
        </button>
        <span>Página {{ paginaActual }} de {{ totalPaginas }}</span>
        <button 
          [disabled]="paginaActual === totalPaginas"
          (click)="cambiarPagina(paginaActual + 1)">
          Siguiente →
        </button>
      </div>
    </div>
  `,
  styles: [`
    .postulantes-container {
      padding: 20px;
    }
    
    .filtros {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    
    .postulante-card {
      display: flex;
      align-items: center;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 8px;
      margin-bottom: 10px;
    }
    
    .avatar {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      margin-right: 15px;
    }
    
    .info {
      flex: 1;
    }
    
    .estado {
      padding: 5px 10px;
      border-radius: 4px;
      font-weight: bold;
      margin-right: 15px;
    }
    
    .estado.pendiente { background: #fff3cd; color: #856404; }
    .estado.aceptada { background: #d4edda; color: #155724; }
    .estado.rechazada { background: #f8d7da; color: #721c24; }
    .estado.en_revision { background: #cce5ff; color: #004085; }
    
    .acciones {
      display: flex;
      gap: 5px;
    }
    
    .paginacion {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 15px;
      margin-top: 20px;
    }
  `]
})
export class PostulantesComponent implements OnInit {
  vacanteId: string = '';
  vacanteTitulo: string = '';
  postulantes: any[] = [];
  paginaActual: number = 1;
  totalPaginas: number = 1;
  totalResultados: number = 0;
  
  filtroEstado: string = '';
  filtroBuscar: string = '';

  constructor(
    private route: ActivatedRoute,
    private postulantesService: PostulantesService,
    public authService: AuthService
  ) {}

  ngOnInit(): void {
    this.vacanteId = this.route.snapshot.params['vacanteId'] || '';
    this.cargarPostulantes();
  }

  async cargarPostulantes(): Promise<void> {
    try {
      const response = await this.postulantesService
        .obtenerPostulantesPorVacante(this.vacanteId, {
          estado: this.filtroEstado,
          buscar: this.filtroBuscar,
          page: this.paginaActual,
          limite: 10
        })
        .toPromise();

      this.postulantes = response?.datos || [];
      this.totalPaginas = response?.totalPaginas || 1;
      this.totalResultados = response?.totalResultados || 0;
    } catch (error) {
      console.error('Error cargando postulantes:', error);
    }
  }

  aplicarFiltros(): void {
    this.paginaActual = 1;
    this.cargarPostulantes();
  }

  cambiarPagina(pagina: number): void {
    this.paginaActual = pagina;
    this.cargarPostulantes();
  }

  async cambiarEstado(
    postulacionId: string, 
    nuevoEstado: string
  ): Promise<void> {
    try {
      await this.postulantesService
        .cambiarEstado(postulacionId, nuevoEstado)
        .toPromise();
      
      // Recargar lista
      this.cargarPostulantes();
    } catch (error) {
      console.error('Error cambiando estado:', error);
    }
  }

  verDetalle(postulante: any): void {
    // Abrir modal o navegar a detalle
    console.log('Ver detalle:', postulante);
  }
}
```

---

### 3. Servicio de Empleo (Completo)

```typescript
// empleo.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EmpleoService {
  private readonly API_URL = 'https://raices-backend-jftu6lrbda-uc.a.run.app/api';

  constructor(private http: HttpClient) {}

  // =====================
  // VACANTES (Público)
  // =====================

  /**
   * Listar vacantes disponibles
   */
  listarVacantes(filtros?: {
    buscar?: string;
    institucionId?: string;
    modalidad?: string;
    discapacidad?: string;
    page?: number;
    limite?: number;
  }): Observable<any> {
    let params = new HttpParams();
    
    if (filtros) {
      Object.keys(filtros).forEach(key => {
        const value = filtros[key as keyof typeof filtros];
        if (value !== undefined && value !== null) {
          params = params.set(key, value.toString());
        }
      });
    }

    return this.http.get(`${this.API_URL}/empleo`, { params });
  }

  /**
   * Obtener detalle de vacante
   */
  obtenerVacante(id: string): Observable<any> {
    return this.http.get(`${this.API_URL}/empleo/${id}`);
  }

  // =====================
  // VACANTES (Institución)
  // =====================

  /**
   * Crear nueva vacante
   * Requiere: rol institucion o admin
   */
  crearVacante(datos: {
    titulo: string;
    descripcion: string;
    requisitos?: string[];
    modalidad?: string;
    salario?: string;
    ubicacion?: string;
    horario?: string;
    tiposDiscapacidad?: string[];
    contactoEmail?: string;
    contactoTelefono?: string;
  }): Observable<any> {
    return this.http.post(`${this.API_URL}/empleo`, datos);
  }

  /**
   * Actualizar vacante
   */
  actualizarVacante(id: string, datos: any): Observable<any> {
    return this.http.put(`${this.API_URL}/empleo/${id}`, datos);
  }

  /**
   * Eliminar/desactivar vacante
   */
  eliminarVacante(id: string): Observable<any> {
    return this.http.delete(`${this.API_URL}/empleo/${id}`);
  }

  // =====================
  // POSTULACIONES (PCD/Tutor)
  // =====================

  /**
   * Postularse a una vacante
   */
  postularse(vacanteId: string, cartaPresentacion: string): Observable<any> {
    return this.http.post(`${this.API_URL}/empleo/${vacanteId}/postularse`, {
      cartaPresentacion
    });
  }

  /**
   * Obtener IDs de vacantes postuladas
   */
  obtenerVacantesPostuladas(): Observable<any> {
    return this.http.get(`${this.API_URL}/empleo/postuladas`);
  }

  /**
   * Obtener mis postulaciones con detalles
   */
  obtenerMisPostulaciones(filtros?: {
    estado?: string;
    buscar?: string;
  }): Observable<any> {
    let params = new HttpParams();
    
    if (filtros?.estado) {
      params = params.set('estado', filtros.estado);
    }
    if (filtros?.buscar) {
      params = params.set('buscar', filtros.buscar);
    }

    return this.http.get(`${this.API_URL}/empleo/mis-postulaciones`, { params });
  }

  // =====================
  // POSTULANTES (Institución)
  // =====================

  /**
   * Obtener postulantes de MI institución
   */
  obtenerPostulantesMiInstitucion(filtros?: {
    vacanteId?: string;
    estado?: string;
    buscar?: string;
    page?: number;
    limite?: number;
  }): Observable<any> {
    let params = new HttpParams();
    
    if (filtros) {
      Object.keys(filtros).forEach(key => {
        const value = filtros[key as keyof typeof filtros];
        if (value !== undefined && value !== null) {
          params = params.set(key, value.toString());
        }
      });
    }

    return this.http.get(`${this.API_URL}/empleo/postulantes-institucion`, { params });
  }

  /**
   * Obtener postulantes de una vacante específica
   */
  obtenerPostulantesPorVacante(vacanteId: string, filtros?: any): Observable<any> {
    let params = new HttpParams().set('vacanteId', vacanteId);
    
    if (filtros) {
      Object.keys(filtros).forEach(key => {
        if (filtros[key] !== undefined) {
          params = params.set(key, filtros[key].toString());
        }
      });
    }

    return this.http.get(`${this.API_URL}/empleo/postulantes-vacante`, { params });
  }

  /**
   * Alias: obtener postulantes por vacante
   */
  obtenerPostulacionesPorVacante(vacanteId: string, filtros?: any): Observable<any> {
    let params = new HttpParams().set('vacanteId', vacanteId);
    
    if (filtros) {
      Object.keys(filtros).forEach(key => {
        if (filtros[key] !== undefined) {
          params = params.set(key, filtros[key].toString());
        }
      });
    }

    return this.http.get(`${this.API_URL}/empleo/postulaciones`, { params });
  }

  /**
   * Cambiar estado de postulación
   */
  cambiarEstadoPostulacion(
    postulacionId: string,
    estado: string,
    comentarios?: string
  ): Observable<any> {
    return this.http.patch(`${this.API_URL}/empleo/postulaciones/${postulacionId}/estado`, {
      estado,
      comentarios
    });
  }
}
```

---

## ⚠️ Manejo de Errores

### Tipos de Error del Backend

```typescript
// error-handler.service.ts
import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';

interface BackendError {
  statusCode: number;
  message: string;
  error: string;
}

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService {
  
  constructor(private toastr: ToastrService) {}

  manejarError(error: HttpErrorResponse): void {
    const backendError = error.error as BackendError;
    
    switch (error.status) {
      case 400:
        this.toastr.error(
          backendError?.message || 'Datos inválidos',
          'Error de validación'
        );
        break;
        
      case 401:
        this.toastr.error(
          'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
          'No autorizado'
        );
        // Redirigir a login
        break;
        
      case 403:
        this.toastr.error(
          backendError?.message || 'No tienes permisos para esta acción',
          'Acceso denegado'
        );
        break;
        
      case 404:
        this.toastr.error(
          backendError?.message || 'El recurso no fue encontrado',
          'No encontrado'
        );
        break;
        
      case 409:
        this.toastr.error(
          backendError?.message || 'El recurso ya existe',
          'Conflicto'
        );
        break;
        
      case 429:
        this.toastr.warning(
          'Has realizado demasiadas peticiones. Espera un momento.',
          'Límite alcanzado'
        );
        break;
        
      case 500:
        this.toastr.error(
          'Error interno del servidor. Intenta más tarde.',
          'Error del servidor'
        );
        break;
        
      default:
        this.toastr.error(
          'Ocurrió un error inesperado',
          'Error'
        );
    }
  }

  /**
   * Verificar si el error es de permisos
   */
  esErrorPermisos(error: HttpErrorResponse): boolean {
    return error.status === 403;
  }

  /**
   * Verificar si el error es de autenticación
   */
  esErrorAutenticacion(error: HttpErrorResponse): boolean {
    return error.status === 401;
  }
}
```

---

## ✅ Buenas Prácticas

### 1. Siempre Verificar Features Antes de Mostrar UI

```typescript
// ❌ MAL
<button (click)="crearVacante()">Crear Vacante</button>

// ✅ BIEN
<button 
  *ngIf="authService.tieneFeature('postulaciones')"
  (click)="crearVacante()">
  Crear Vacante
</button>
```

### 2. Verificar Roles para Acciones Sensibles

```typescript
// ❌ MAL
<button (click)="eliminarVacante()">Eliminar</button>

// ✅ BIEN
<button 
  *ngIf="authService.tieneRol('institucion', 'admin')"
  (click)="eliminarVacante()">
  Eliminar
</button>
```

### 3. Usar Guards en Rutas

```typescript
// ❌ MAL - Sin protección
{ path: 'empleo', component: EmpleoComponent }

// ✅ BIEN - Con guards
{
  path: 'empleo',
  canActivate: [AuthGuard, FeatureGuard],
  data: { feature: 'postulaciones' },
  component: EmpleoComponent
}
```

### 4. Manejar Errores de Permiso

```typescript
async cargarPostulantes(): Promise<void> {
  try {
    const response = await this.postulantesService
      .obtenerPostulantesPorVacante(this.vacanteId)
      .toPromise();
    
    this.postulantes = response?.datos || [];
  } catch (error) {
    if (this.errorHandler.esErrorPermisos(error)) {
      // Mostrar mensaje amigable
      this.toastr.info(
        'No tienes permiso para ver los postulantes de esta vacante.',
        'Acceso restringido'
      );
      // O redirigir
      this.router.navigate(['/empleo']);
    } else {
      this.errorHandler.manejarError(error);
    }
  }
}
```

### 5. Cache de Tokens

```typescript
// Evitar múltiples refresh tokens simultáneos
private isRefreshing = false;
private refreshTokenSubject = new BehaviorSubject<string | null>(null);

intercept(request: HttpRequest<any>, next: HttpHandler) {
  // ... lógica de token
}
```

### 6. Lazy Loading de Módulos

```typescript
// app-routing.module.ts
const routes: Routes = [
  {
    path: 'empleo',
    loadChildren: () => import('./empleo/empleo.module')
      .then(m => m.EmpleoModule),
    canActivate: [AuthGuard, FeatureGuard],
    data: { feature: 'postulaciones' }
  },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.module')
      .then(m => m.AdminModule),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['admin'] }
  }
];
```

---

## 📚 Recursos Adicionales

- **Swagger UI:** https://raices-backend-jftu6lrbda-uc.a.run.app/docs
- **Health Check:** https://raices-backend-jftu6lrbda-uc.a.run.app/api/health
- **Documentación de Endpoints:** [API-ENDPOINTS.md](./API-ENDPOINTS.md)

---

## 🔄 Cambios Recientes

### Agosto 2026
- ✅ Nuevo endpoint `GET /empleo/postulantes-vacante` para consultar postulantes por vacante
- ✅ Alias `GET /empleo/postulaciones` para compatibilidad
- ✅ Sistema de feature flags para control granular
- ✅ Guards reutilizables para autenticación y autorización

---

**¿Necesitas ayuda?** Consulta la documentación de Swagger o contacta al equipo de backend.
