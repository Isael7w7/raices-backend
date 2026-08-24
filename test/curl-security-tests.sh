#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# RAÍCES Backend — Security Test Suite (cURL)
# ══════════════════════════════════════════════════════════════════════════════
#
# Instrucciones:
# 1. Inicia el servidor: pnpm run dev
# 2. Ejecuta este script: bash test/curl-security-tests.sh
# 3. Verifica que cada test retorne el código de estado esperado
#
# Prerrequisitos:
# - Servidor corriendo en http://localhost:3000
# - Usuarios sembrados en la base de datos
# ══════════════════════════════════════════════════════════════════════════════

BASE_URL="http://localhost:3000/api"
PASS=0
FAIL=0

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_status() {
  local test_name="$1"
  local expected="$2"
  local actual="$3"
  
  if [ "$actual" = "$expected" ]; then
    echo -e "${GREEN}✓ PASS${NC} $test_name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✗ FAIL${NC} $test_name — esperado HTTP $expected, recibido HTTP $actual"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  RAÍCES Backend — Security Test Suite"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── 1. Authentication Tests ────────────────────────────────────────────────
echo "── 1. Authentication ──"

# 1.1 Register new user
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/autenticacion/registro" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-user@example.com","password":"Test1234","nombreCompleto":"Test User","rol":"pcd"}')
check_status "POST /autenticacion/registro (nuevo usuario)" "201" "$STATUS"

# 1.2 Duplicate email
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/autenticacion/registro" \
  -H "Content-Type: application/json" \
  -d '{"email":"test-user@example.com","password":"Test1234","nombreCompleto":"Duplicate","rol":"pcd"}')
check_status "POST /autenticacion/registro (email duplicado)" "409" "$STATUS"

# 1.3 Invalid email format
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/autenticacion/registro" \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"Test1234","nombreCompleto":"Bad Email","rol":"pcd"}')
check_status "POST /autenticacion/registro (email inválido)" "400" "$STATUS"

# 1.4 Short password
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/autenticacion/registro" \
  -H "Content-Type: application/json" \
  -d '{"email":"short@test.com","password":"123","nombreCompleto":"Short","rol":"pcd"}')
check_status "POST /autenticacion/registro (contraseña corta)" "400" "$STATUS"

# 1.5 Invalid role
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/autenticacion/registro" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"Test1234","nombreCompleto":"Fake Admin","rol":"superadmin"}')
check_status "POST /autenticacion/registro (rol inválido)" "400" "$STATUS"

# 1.6 Login with invalid credentials
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/autenticacion/inicio-sesion" \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@test.com","password":"wrong"}')
check_status "POST /autenticacion/inicio-sesion (credenciales incorrectas)" "401" "$STATUS"

echo ""

# ─── 2. RBAC Tests ─────────────────────────────────────────────────────────
echo "── 2. RBAC (Role-Based Access Control) ──"

# 2.1 Admin endpoint without token
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/administracion/estadisticas")
check_status "GET /administracion/estadisticas (sin token)" "401" "$STATUS"

# 2.2 Admin endpoint with PCD token (should be 403)
# Note: In E2E tests, the token IS the UID. In production, use a real JWT.
echo -e "${YELLOW}⚠ SKIP${NC} RBAC tests with role tokens — requiere JWT real en producción"
echo "   En producción, usa tokens JWT de Firebase Auth con roles específicos"
echo ""

# ─── 3. IDOR Tests ──────────────────────────────────────────────────────────
echo "── 3. IDOR (Insecure Direct Object Reference) ──"

# 3.1 Messages without conversation — expect 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer uid-alice" \
  "$BASE_URL/mensajes/con/uid-bob")
check_status "GET /mensajes/con/uid-bob (sin conversación)" "403" "$STATUS"

# 3.2 Messages endpoint without auth
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/mensajes/con/uid-bob")
check_status "GET /mensajes/con/uid-bob (sin token)" "401" "$STATUS"

# 3.3 Send message to self
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/mensajes/enviar/uid-alice" \
  -H "Authorization: Bearer uid-alice" \
  -H "Content-Type: application/json" \
  -d '{"contenido":"Auto-mensaje"}')
check_status "POST /mensajes/enviar/uid-alice (enviar a sí mismo)" "403" "$STATUS"

# 3.4 Send message to non-existent user
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/mensajes/enviar/uid-inexistente" \
  -H "Authorization: Bearer uid-alice" \
  -H "Content-Type: application/json" \
  -d '{"contenido":"Hola"}')
check_status "POST /mensajes/enviar/uid-inexistente (usuario no existe)" "403" "$STATUS"

echo ""

# ─── 4. CSRF Tests ──────────────────────────────────────────────────────────
echo "── 4. CSRF (Cross-Site Request Forgery) ──"

# 4.1 Logout from malicious origin
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/autenticacion/cerrar-sesion" \
  -H "Origin: https://evil-site.com")
check_status "POST /autenticacion/cerrar-sesion (origen malicioso)" "403" "$STATUS"

# 4.2 Logout from allowed origin
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/autenticacion/cerrar-sesion" \
  -H "Origin: https://raices.techmaleon.com.mx")
check_status "POST /autenticacion/cerrar-sesion (origen permitido)" "204" "$STATUS"

# 4.3 Logout without Origin header (same-origin)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$BASE_URL/autenticacion/cerrar-sesion")
check_status "POST /autenticacion/cerrar-sesion (sin Origin)" "204" "$STATUS"

echo ""

# ─── 5. Cookie Security Tests ───────────────────────────────────────────────
echo "── 5. Cookie Security ──"

# 5.1 Auth via httpOnly cookie
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Cookie: token_acceso=uid-pcd; token_refresco=irrelevante" \
  "$BASE_URL/autenticacion/yo")
check_status "GET /autenticacion/yo (cookie httpOnly)" "200" "$STATUS"

# 5.2 Auth with empty cookie
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Cookie: token_acceso=" \
  "$BASE_URL/autenticacion/yo")
check_status "GET /autenticacion/yo (cookie vacía)" "401" "$STATUS"

echo ""

# ─── 6. Self-Protection Tests ───────────────────────────────────────────────
echo "── 6. Self-Protection ──"

# These tests require a real admin token in production
echo -e "${YELLOW}⚠ SKIP${NC} Self-protection tests — requiere JWT admin real en producción"
echo "   Verificar manualmente que admin no puede:"
echo "   - Desactivar su propia cuenta"
echo "   - Cambiar su propio rol"
echo "   - Eliminarse a sí mismo"
echo ""

# ─── Summary ────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════"
echo -e "  Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ $FAIL -gt 0 ]; then
  exit 1
fi
