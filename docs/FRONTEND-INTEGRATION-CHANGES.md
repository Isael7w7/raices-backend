# 📋 Guía de Integración Frontend — Cambios Backend MVP Raíces

> **Última actualización:** 13 de agosto de 2026
> **Estado:** Activo — se actualiza con cada cambio realizado

---

## 📌 Resumen de Cambios

| Versión | Fecha | Descripción | Archivos afectados |
|---------|-------|-------------|-------------------|
| v1.0 | 13/08/2026 | Campos de identidad, escalas de vida, catálogos, resúmenes IA | 17 archivos |

---

## 1. Campos de Identidad en Registro

### Endpoint: `POST /api/autenticacion/registro`

**Nuevos campos opcionales en el body:**

```typescript
{
  // ... campos existentes (email, password, nombreCompleto, rol, etc.) ...
  
  // NUEVOS CAMPOS (Spec MVP Raíces)
  destinatarioRegistro?: 'para_mi' | 'para_hijo' | 'para_familiar' | 'para_cuidado'
  curp?: string                    // 18 caracteres alfanuméricos
  telefonoContacto?: string       // Teléfono o WhatsApp
  preferenciasAcompanamiento?: 'explorar_solo' | 'recomendaciones_paso' | 'apoyo_necesite'
}
```

### Endpoint: `GET /api/autenticacion/yo`

**Respuesta ahora incluye:**

```typescript
{
  // ... campos existentes ...
  destinatarioRegistro: string | null
  curp: string | null
  telefonoContacto: string | null
  preferenciasAcompanamiento: string | null
}
```

### Endpoint: `PUT /api/usuarios/perfil`

**Nuevos campos para actualizar:**

```typescript
{
  // ... campos existentes ...
  curp?: string
  telefonoContacto?: string
  destinatarioRegistro?: 'para_mi' | 'para_hijo' | 'para_familiar' | 'para_cuidado'
  preferenciasAcompanamiento?: 'explorar_solo' | 'recomendaciones_paso' | 'apoyo_necesite'
}
```

---

## 2. Evaluación "Cómo vives hoy" (Escalas de Vida)

### Endpoint: `POST /api/usuarios/escalas-vida`

**Body:**

```typescript
{
  // 8 escalas con niveles 1-4
  nivelAutonomia: 1 | 2 | 3 | 4
  nivelIndependencia: 1 | 2 | 3 | 4
  nivelComunicacion: 1 | 2 | 3 | 4
  nivelComprension: 1 | 2 | 3 | 4
  nivelEnergia: 1 | 2 | 3 | 4
  nivelMovilidad: 1 | 2 | 3 | 4
  nivelSocial: 1 | 2 | 3 | 4
  nivelEmocional: 1 | 2 | 3 | 4

  // Diagnóstico
  tieneDiagnostico: boolean

  // Opcionales
  temporalidadOrigen?: 'nacimiento' | 'infancia' | 'adolescencia' | 'vida_adulta' | 'progresiva' | 'en_evaluacion'
  preferenciaFormato?: 'texto' | 'imagenes' | 'audio' | 'video' | 'presencial'
  areasInteres?: string[]    // IDs de áreas de interés
  viabilidadEconomica?: 'gratuita_becas' | 'bajo_costo' | 'moderada' | 'sin_restricciones'
}
```

**Respuesta:**

```typescript
{
  escalasVida: {
    autonomia: number
    independencia: number
    comunicacion: number
    comprension: number
    energia: number
    movilidad: number
    social: number
    emocional: number
  }
  tieneDiagnostico: boolean
  requiereEvaluacion: boolean   // true si tieneDiagnostico = false
  temporalidadOrigen: string | null
  preferenciaFormato: string | null
  areasInteres: string[]
  viabilidadEconomica: string | null
}
```

### Endpoint: `GET /api/usuarios/perfil` (respuesta actualizada)

**El `perfilNecesidades` ahora incluye:**

```typescript
{
  // ... campos existentes ...
  escalasVida: {
    autonomia: number
    independencia: number
    comunicacion: number
    comprension: number
    energia: number
    movilidad: number
    social: number
    emocional: number
  } | null
  tieneDiagnostico: boolean | null
  requiereEvaluacion: boolean
  temporalidadOrigen: string | null
  preferenciaFormato: string | null
  areasInteres: string[] | null
  viabilidadEconomica: string | null
}
```

---

## 3. Catálogos Actualizados

### Endpoint: `GET /api/catalogos`

**Respuesta ahora incluye:**

```typescript
{
  parentescos: string[]
  discapacidades: string[]          // ACTUALIZADO: 15 opciones
  etapasVida: { id: string; label: string }[]
  temporalidadOrigen: { id: string; label: string }[]    // NUEVO
  preferenciaFormato: { id: string; label: string; description: string }[]  // NUEVO
  areasInteres: {                    // NUEVO
    id: string
    label: string
    subcategorias?: { id: string; label: string; description: string }[]
  }[]
  viabilidadEconomica: { id: string; label: string; description: string }[]  // NUEVO
  features: { id: string; label: string; description: string }[]
  categorias: { id: string; label: string; color: string }[]
}
```

### Nuevos endpoints individuales:

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/catalogos/temporalidad-origen` | Origen/temporalidad de la condición |
| `GET /api/catalogos/preferencia-formato` | Formatos de contenido preferidos |
| `GET /api/catalogos/areas-interes` | Áreas de interés con subcategorías |
| `GET /api/catalogos/viabilidad-economica` | Viabilidad económica |

### Catálogo de discapacidades (actualizado):

```typescript
[
  'Intelectual/Cognitiva',
  'Motriz',
  'Visual',
  'Auditiva',
  'Habla/Comunicación',
  'TEA / Autismo',
  'TDAH',              // NUEVO
  'Dislexia',          // NUEVO
  'Dispraxia',         // NUEVO
  'Tourette',          // NUEVO
  'Altas capacidades', // NUEVO
  'Otra neurodivergencia', // NUEVO
  'Psicosocial',
  'Múltiple',
  'Prefiero no responder', // NUEVO
]
```

---

## 4. Resúmenes IA (1 y 3 párrafos)

### Endpoint: `POST /api/ia/resumen`

**Body:** (vacío — usa el usuario autenticado)

**Respuesta:**

```typescript
{
  resumenUnParrafo: string    // Historia interpretativa (80-150 palabras)
  resumenTresParrafos: {
    quienEres: string         // Primer párrafo: quién es
    contexto: string          // Segundo párrafo: contexto
    intereses: string         // Tercer párrafo: intereses/aspiraciones
  }
  simulado: boolean           // true si no hay Vertex AI configurado
}
```

> **Nota:** El backend instruye al LLM usar SOLO datos del usuario. No inventa información.

---

## 5. Tipos TypeScript para el Frontend

### Tipos de escalas de vida:

```typescript
export interface EscalasVida {
  autonomia: 1 | 2 | 3 | 4
  independencia: 1 | 2 | 3 | 4
  comunicacion: 1 | 2 | 3 | 4
  comprension: 1 | 2 | 3 | 4
  energia: 1 | 2 | 3 | 4
  movilidad: 1 | 2 | 3 | 4
  social: 1 | 2 | 3 | 4
  emocional: 1 | 2 | 3 | 4
}

export type DestinatarioRegistro = 'para_mi' | 'para_hijo' | 'para_familiar' | 'para_cuidado'
export type PreferenciaAcompanamiento = 'explorar_solo' | 'recomendaciones_paso' | 'apoyo_necesite'
export type TemporalidadOrigen = 'nacimiento' | 'infancia' | 'adolescencia' | 'vida_adulta' | 'progresiva' | 'en_evaluacion'
export type PreferenciaFormato = 'texto' | 'imagenes' | 'audio' | 'video' | 'presencial'
export type ViabilidadEconomica = 'gratuita_becas' | 'bajo_costo' | 'moderada' | 'sin_restricciones'

export interface GuardarEscalasVidaPayload {
  nivelAutonomia: number
  nivelIndependencia: number
  nivelComunicacion: number
  nivelComprension: number
  nivelEnergia: number
  nivelMovilidad: number
  nivelSocial: number
  nivelEmocional: number
  tieneDiagnostico: boolean
  temporalidadOrigen?: TemporalidadOrigen
  preferenciaFormato?: PreferenciaFormato
  areasInteres?: string[]
  viabilidadEconomica?: ViabilidadEconomica
}

export interface ResumenIA {
  resumenUnParrafo: string
  resumenTresParrafos: {
    quienEres: string
    contexto: string
    intereses: string
  }
  simulado: boolean
}
```

---

## 6. Checklist de Integración Frontend

- [ ] **Formulario de registro:** Agregar select de destinatario (Para mí / Para mi hijo / etc.)
- [ ] **Formulario de registro:** Agregar campo CURP con validación de 18 caracteres
- [ ] **Formulario de registro:** Agregar campo teléfono/WhatsApp
- [ ] **Formulario de registro:** Agregar select de preferencia de acompañamiento
- [ ] **Perfil de usuario:** Mostrar/editar campos nuevos en la sección de perfil
- [ ] **Evaluación "Cómo vives hoy":** Crear formulario con 8 sliders/radios (1-4)
- [ ] **Evaluación "Cómo vives hoy":** Agregar toggle de diagnóstico (Sí/No)
- [ ] **Evaluación "Cómo vives hoy":** Agregar select de temporalidad/origen
- [ ] **Evaluación "Cómo vives hoy":** Agregar select de formato preferido
- [ ] **Evaluación "Cómo vives hoy":** Agregar selector de áreas de interés (múltiple)
- [ ] **Evaluación "Cómo vives hoy":** Agregar select de viabilidad económica
- [ ] **Catálogos:** Actualizar opciones de discapacidades (15 opciones)
- [ ] **Catálogos:** Consumir nuevos endpoints de temporalidad, formato, áreas interés, viabilidad
- [ ] **IA:** Crear componente/modal para mostrar resumen de 1 párrafo
- [ ] **IA:** Crear componente para mostrar resumen de 3 párrafos
- [ ] **Flag de evaluación:** Si `requiereEvaluacion = true`, mostrar banner/CTA para conectar con especialistas

---

## 7. Flujo de UX Recomendado

### Registro:
```
1. Seleccionar destinatario (Para mí / Para mi hijo / etc.)
2. Completar datos básicos + CURP + teléfono
3. Seleccionar preferencia de acompañamiento
4. Registrar cuenta
```

### Post-registro (onboarding):
```
1. Completar perfil de necesidades (campos existentes)
2. Realizar evaluación "Cómo vives hoy" (8 escalas)
3. Indicar diagnóstico (Sí/No)
4. Seleccionar temporalidad/origen
5. Seleccionar formato preferido
6. Seleccionar áreas de interés
7. Indicar viabilidad económica
```

### Dashboard (si tiene perfil completo):
```
1. Ver resumen narrativo (1 párrafo)
2. Ver resumen consolidado (3 párrafos)
3. Recomendaciones personalizadas
4. Si requiereEvaluacion = true → CTA para especialistas
```

---

## 8. Notas para el Backend (próximos cambios)

Los siguientes módulos están pendientes de implementación:
- Upload de documentos de identidad (CURP + identificación oficial)
- Flujo de validación diferida de identidad (admin aprueba → correo de aceptación)
- Módulo de "Rutas y Caminos de Desarrollo" completo

> Este documento se actualizará con cada cambio realizado en el backend.
