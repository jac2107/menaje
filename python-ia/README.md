\# Servicio de IA - Menaje



\## Descripción

Microservicio Python + FastAPI para integración de Google Gemini API en el sistema de alquiler de menaje.



\## Requisitos

\- Python 3.9+

\- PostgreSQL 14+

\- Google Gemini API Key



\## Instalación



\### 1. Crear virtual environment

```bash

python -m venv venv

venv\\Scripts\\activate  # Windows

source venv/bin/activate  # Mac/Linux

```



\### 2. Instalar dependencias

```bash

pip install -r requirements.txt

```



\### 3. Configurar .env

Copiar valores de backend/.env y agregar API\_GEMINI\_KEY



\### 4. Ejecutar servidor

```bash

python main.py

```



El servidor estará en: http://localhost:8000



\## Endpoints

\- GET /health - Health check

\- POST /chat - Chat con IA Gemini



\## Documentación

http://localhost:8000/docs (Swagger UI)

