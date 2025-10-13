
# Quixo Starter (ASP.NET Core 8 + React Vite)

## Estructura
```
QuixoSolution/
  backend/Quixo.Api/        # ASP.NET Core 8 Minimal API + Dapper
  frontend/quixo-web/       # React + Vite SPA
  db/Scripts/quixo_mysql.sql
```

## Requisitos
- **MySQL 8+** con base `quixo` creada (`db/Scripts/quixo_mysql.sql`).
- **.NET SDK 8** (VS 2022 actualizado).
- **Node.js 18+** para el front.

## Backend (Visual Studio 2022)
1. Abrir **Quixo.Api.csproj** en Visual Studio 2022 (o abrir la carpeta `backend/Quixo.Api`).
2. Edita `appsettings.json` con tu usuario/clave MySQL.
3. Ejecuta (F5). La API expone Swagger en `/swagger`.
   - Nota: Puerto típico 5199; si cambia, define `VITE_API_URL` en el front.

## Frontend (VS Code o tu editor)
```bash
cd frontend/quixo-web
npm i
# si el backend corre en otro puerto/host:
# set VITE_API_URL=http://localhost:5199   (Windows PowerShell: $env:VITE_API_URL='http://localhost:5199')
npm run dev
```
Abre http://localhost:5173

## Datos de ejemplo
En la tabla `players`, agrega 4 jugadores con IDs 1..4 o ajusta `NewGame.jsx`.
La lógica de empuje y validaciones completas de Quixo se deja a implementar por el equipo.

## Exportar XML
GET `/api/games/{id}/export.xml`.

## Estadísticas
GET `/api/stats/duo` y `/api/stats/quartet`.




## Integrantes> nombres - carnés de los integrantes del grupo y correo de GIT.
- ### Ricardo Patiño Jiménez - FH22011118 - Usuario y correo de Git: Ricardo-Patino rickpatinor@gmail.com
- ### Isaac Arias Morera - FI23028657 - Usuario y correo de Git: IsaacAriasMore jarias30680@ufide.ac.cr
- ### Alex Monge Arias - FH23014026 - Usuario y correo de Git: ALE20201 amonge50242@ufide.ac.cr
- ### Brandon Cespedes - FH22012992 - Usuario y correo de Git: Bcespedes04 bcespedes@traarepuestos.com
