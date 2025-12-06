using System.Data;
using MySqlConnector;
using Dapper;

var builder = WebApplication.CreateBuilder(args);

// Configura CORS para entorno de desarrollo.
builder.Services.AddCors(o => o.AddPolicy("dev",
    p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

// Registra la conexión MySQL como servicio singleton.
var connStr = builder.Configuration.GetConnectionString("MySql");
builder.Services.AddSingleton<IDbConnection>(_ => new MySqlConnection(connStr));

// Swagger para documentación de API.
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
app.UseCors("dev");
app.UseSwagger();
app.UseSwaggerUI();

// Endpoint de salud del API.
app.MapGet("/api/health", () => Results.Ok(new { ok = true, ts = DateTime.UtcNow }));

// ----------------- helpers -----------------
// Mapea la dirección del empuje a eje y extremo.
static (string axis, string end) MapDir(string d) => d switch
{
    "LEFT" => ("ROW", "MIN"),
    "RIGHT" => ("ROW", "MAX"),
    "TOP" => ("COL", "MIN"),
    "BOTTOM" => ("COL", "MAX"),
    _ => ("ROW", "MIN")
};
// Convierte índice lineal (0–24) a coordenada fila/columna (1–5).
static (int r, int c) ToRowCol(int idx) => (idx / 5 + 1, idx % 5 + 1);

// ----------------- API -----------------
// Crea una nueva partida (DUO o QUARTET) y registra sus participantes.
app.MapPost("/api/games", async (IDbConnection db, CreateGameDto dto) =>
{
    try
    {
        // Inserta partida y obtiene ID.
        // games.status usa DEFAULT 'IN_PROGRESS'
        var gameId = await db.ExecuteScalarAsync<long>(
            "INSERT INTO games (mode) VALUES (@Mode); SELECT LAST_INSERT_ID();",
            new { dto.Mode });
        // Registro de participantes en modo DUO.
        if (dto.Mode == "DUO")
        {
            if (dto.PlayerTopId == null || dto.PlayerBottomId == null)
                return Results.BadRequest("DUO requiere playerTopId y playerBottomId");

            // En DUO no hay equipos; símbolos predefinidos.
            // team NULL en DUO; símbolos fijos
            await db.ExecuteAsync(@"
INSERT INTO game_participants
(game_id, seat, player_id, team, symbol_at_game, turn_order)
VALUES
(@gid,'TOP',    @pTop, NULL, 'CIRCLE', 1),
(@gid,'BOTTOM', @pBot, NULL, 'CROSS',  2);",
                new { gid = gameId, pTop = dto.PlayerTopId, pBot = dto.PlayerBottomId });
        }
        // Registro de participantes en QUARTET.
        else if (dto.Mode == "QUARTET")
        {
            if (dto.PlayerTopId == null || dto.PlayerRightId == null || dto.PlayerBottomId == null || dto.PlayerLeftId == null)
                return Results.BadRequest("QUARTET requiere los 4 asientos");
            // Equipos y símbolos definidos según asiento.
            await db.ExecuteAsync(@"
INSERT INTO game_participants
(game_id, seat, player_id, team, symbol_at_game, turn_order)
VALUES
(@gid,'TOP',    @top,    'A','CIRCLE',1),
(@gid,'RIGHT',  @right,  'B','CROSS', 2),
(@gid,'BOTTOM', @bottom, 'A','CIRCLE',3),
(@gid,'LEFT',   @left,   'B','CROSS', 4);",
                new { gid = gameId, top = dto.PlayerTopId, right = dto.PlayerRightId, bottom = dto.PlayerBottomId, left = dto.PlayerLeftId });
        }
        else return Results.BadRequest("mode debe ser DUO o QUARTET");

        return Results.Ok(new { id = gameId });
    }
    catch (Exception ex)
    {
        // Retorna error de BD con detalle.
        return Results.Problem(title: "DB error (create game)", detail: ex.Message, statusCode: 500);
    }
});

app.MapPost("/api/games/{gameId:long}/moves", async (IDbConnection db, long gameId, CreateMoveDto dto) =>
{
    try
    {
        // Registra un movimiento en una partida existente.
        var gp = await db.QueryFirstOrDefaultAsync<(string team, long player_id)>(@"
SELECT team, player_id FROM game_participants
WHERE game_id=@gid AND seat=@seat;", new { gid = gameId, seat = dto.ActorSeat });

        // Obtiene jugador y equipo del asiento.
        var moveNo = await db.ExecuteScalarAsync<int>(
            "SELECT COALESCE(MAX(move_no),0)+1 FROM moves WHERE game_id=@gid;",
            new { gid = gameId });

        // Calcula número de movimiento siguiente.
        var (axis, end) = MapDir(dto.PushDirection);
        var (remR, remC) = ToRowCol(dto.PickedIndex);
        var placedIndex = axis == "ROW" ? (dto.PlacedIndex % 5) + 1 : (dto.PlacedIndex / 5) + 1;

        // Inserta movimiento principal.
        await db.ExecuteAsync(@"
INSERT INTO moves
(game_id, move_no, played_by, played_seat, played_team,
 removed_row, removed_col, placed_axis, placed_index, placed_end,
 result_symbol, result_dot_dir, caused_win, caused_loss_by_opponent_line, created_at)
VALUES
(@gid, @no, @pid, @seat, @team,
 @remR, @remC, @axis, @pIndex, @pEnd,
 @sym, @dot, @win, @lose, NOW());",
            new
            {
                gid = gameId,
                no = moveNo,
                pid = gp.player_id,
                seat = dto.ActorSeat,
                team = gp.team, // NULL en DUO; A/B en QUARTET
                remR,
                remC,
                axis,
                pIndex = placedIndex,
                pEnd = end,
                sym = dto.Symbol,          // "CIRCLE" | "CROSS"
                dot = dto.DotOrientation,  // "TOP|RIGHT|BOTTOM|LEFT"
                win = dto.CausedWin,
                lose = dto.CausedLose
            });

        // Guarda el estado del tablero para replay.
        await db.ExecuteAsync(@"
INSERT INTO move_state (game_id, move_no, board)
VALUES (@gid, @no, @board);",
            new { gid = gameId, no = moveNo, board = dto.BoardJson });

        // Un trigger puede cerrar la partida si hubo victoria.
        return Results.Ok(new { moveNo });
    }
    catch (Exception ex)
    {
        return Results.Problem(title: "DB error (move)", detail: ex.Message, statusCode: 500);
    }
});
// Lista partidas finalizadas.
app.MapGet("/api/games/finished", async (IDbConnection db) =>
{
    var rows = await db.QueryAsync("SELECT * FROM v_finished_games;");
    return Results.Ok(rows);
});
// Devuelve información completa para "replay" de una partida.
app.MapGet("/api/games/{gameId:long}/replay", async (IDbConnection db, long gameId) =>
{
    var game = await db.QueryFirstOrDefaultAsync("SELECT * FROM games WHERE game_id=@id", new { id = gameId });
    if (game == null) return Results.NotFound();

    var participants = await db.QueryAsync(@"
SELECT * FROM game_participants
WHERE game_id=@id
ORDER BY turn_order ASC;", new { id = gameId });

    var moves = await db.QueryAsync(@"
SELECT m.*, s.board AS board_json
FROM moves m LEFT JOIN move_state s ON s.game_id=m.game_id AND s.move_no=m.move_no
WHERE m.game_id=@id
ORDER BY m.move_no ASC;", new { id = gameId });

    return Results.Ok(new { game, participants, moves });
});

// Estadísticas DUO: usa SP si existe, si no usa fallback SQL.

app.MapGet("/api/stats/duo", async (IDbConnection db) =>
{
    var sql = @"
WITH final_moves AS (
  -- Último movimiento que cerró cada partida DUO (ganó o regaló línea)
  SELECT m.*
  FROM moves m
  JOIN (
    SELECT game_id, MAX(move_no) AS max_move
    FROM moves
    WHERE caused_win = 1 OR caused_loss_by_opponent_line = 1
    GROUP BY game_id
  ) mx ON mx.game_id = m.game_id AND mx.max_move = m.move_no
  JOIN games g ON g.game_id = m.game_id AND g.mode = 'DUO'
),
winners AS (
  -- Ganador por partida:
  --  - si caused_win = 1 => gana quien jugó (played_by)
  --  - si caused_loss_by_opponent_line = 1 => gana el otro jugador
  SELECT
    fm.game_id,
    CASE
      WHEN fm.caused_win = 1 THEN fm.played_by
      WHEN fm.caused_loss_by_opponent_line = 1 THEN
        (
          SELECT gp2.player_id
          FROM game_participants gp2
          WHERE gp2.game_id = fm.game_id
            AND gp2.player_id <> fm.played_by
          LIMIT 1
        )
      ELSE NULL
    END AS winner_player_id
  FROM final_moves fm
)
SELECT
  pl.player_id,
  pl.display_name AS jugador,
  COUNT(DISTINCT gp.game_id) AS played_cnt,
  SUM(CASE WHEN w.winner_player_id = pl.player_id THEN 1 ELSE 0 END) AS ganadas,
  ROUND(
    100.0 * SUM(CASE WHEN w.winner_player_id = pl.player_id THEN 1 ELSE 0 END)
    / NULLIF(COUNT(DISTINCT gp.game_id), 0)
  , 2) AS efectividad_pct
FROM players pl
JOIN game_participants gp ON gp.player_id = pl.player_id
JOIN winners w ON w.game_id = gp.game_id
GROUP BY pl.player_id, pl.display_name
ORDER BY efectividad_pct DESC, ganadas DESC, jugador ASC;
";
    var rows = await db.QueryAsync(sql);
    return Results.Ok(rows);
});


// Estadísticas QUARTET: SP o SQL de respaldo.
app.MapGet("/api/stats/quartet", async (IDbConnection db) =>
{
    var sql = @"
WITH final_moves AS (
  -- Último movimiento que cerró cada partida QUARTET
  SELECT m.*
  FROM moves m
  JOIN (
    SELECT game_id, MAX(move_no) AS max_move
    FROM moves
    WHERE caused_win = 1 OR caused_loss_by_opponent_line = 1
    GROUP BY game_id
  ) mx ON mx.game_id = m.game_id AND mx.max_move = m.move_no
  JOIN games g ON g.game_id = m.game_id AND g.mode = 'QUARTET'
),
winners AS (
  -- Ganador por partida:
  --  - si caused_win = 1 => gana el equipo que jugó (played_team)
  --  - si caused_loss_by_opponent_line = 1 => gana el equipo contrario
  SELECT
    fm.game_id,
    CASE
      WHEN fm.caused_win = 1 THEN fm.played_team
      WHEN fm.caused_loss_by_opponent_line = 1 THEN
        (CASE fm.played_team WHEN 'A' THEN 'B' WHEN 'B' THEN 'A' END)
      ELSE NULL
    END AS winner_team
  FROM final_moves fm
),
totals AS (
  SELECT COUNT(DISTINCT game_id) AS total FROM final_moves
)
SELECT
  w.winner_team AS equipo,
  COUNT(*) AS ganadas,
  t.total AS jugadas,
  ROUND(100.0 * COUNT(*) / NULLIF(t.total, 0), 2) AS efectividad_pct
FROM winners w
CROSS JOIN totals t
GROUP BY w.winner_team, t.total
ORDER BY equipo;
";
    var rows = await db.QueryAsync(sql);
    return Results.Ok(rows);
});


// Exporta partida en XML vía SP o XML mínimo de respaldo.
app.MapGet("/api/games/{gameId:long}/export.xml", async (IDbConnection db, long gameId) =>
{
    try
    {
        var row = await db.QueryFirstOrDefaultAsync<dynamic>("CALL sp_get_game_xml(@gid);", new { gid = gameId });
        var xml = row?.game_xml as string ?? "<game/>";
        return Results.Text(xml, "application/xml");
    }
    catch
    {
        return Results.Text($"<game id=\"{gameId}\"/>", "application/xml");
    }
});
// Redirige raíz hacia Swagger.
app.MapGet("/", () => Results.Redirect("/swagger"));
app.Run();

// ----------------- DTOs -----------------

// Datos requeridos para crear una partida.
public record CreateGameDto(
    string Mode,
    long? PlayerTopId,
    long? PlayerRightId,
    long? PlayerBottomId,
    long? PlayerLeftId
);

// Datos requeridos para registrar un movimiento.
public record CreateMoveDto(
    int TurnNumber,
    string ActorSeat,
    int PickedIndex,
    string PushDirection,
    int PlacedIndex,
    string Symbol,
    string DotOrientation,
    bool CausedWin,
    bool CausedLose,
    string BoardJson
);
