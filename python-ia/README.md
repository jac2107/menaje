# Servicio de IA - Menaje

## Descripción

Microservicio Python + FastAPI para integración de Google Gemini API en el sistema de alquiler de menaje. Recibe peticiones de chat desde el backend Node.js, arma contexto del usuario (datos, últimos alquileres, productos disponibles) consultando PostgreSQL, consulta a Gemini y guarda la conversación en la tabla `conversaciones_ia`.

## Requisitos

- Python 3.9+
- PostgreSQL 14+ (con el schema de `database/schema.sql` aplicado)
- Google Gemini API Key ([aistudio.google.com/apikey](https://aistudio.google.com/apikey))

## Instalación

### 1. Crear virtual environment

```bash
python -m venv venv
venv\Scripts\activate      # Windows
source venv/bin/activate   # Mac/Linux
```

### 2. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 3. Configurar `.env`

Crear/editar `python-ia/.env` con las siguientes variables:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=menajeDB
DB_USER=postgres
DB_PASSWORD=<tu_password>

# Gemini API
API_GEMINI_KEY=<tu_api_key_de_gemini>
GEMINI_MODEL=gemini-3.6-flash
```

⚠️ **Nunca subas `API_GEMINI_KEY` ni `DB_PASSWORD` a GitHub.** El archivo `.env` debe estar en `.gitignore`.

### 4. Ejecutar servidor

```bash
python main.py
```

El servidor estará en: http://localhost:8000

## Endpoints

- `GET /health` - Health check (status, timestamp, modelo activo)
- `POST /chat` - Chat con IA Gemini

  Body:
  ```json
  {
    "usuario_id": 1,
    "mensaje": "¿Qué menaje recomiendas para una boda de 50 personas?",
    "historico": []
  }
  ```

  Respuesta:
  ```json
  {
    "respuesta": "texto generado por Gemini",
    "timestamp": "2026-09-21T12:00:00+00:00",
    "tokens_usados": 123
  }
  ```

## Documentación interactiva

http://localhost:8000/docs (Swagger UI)
