using System.Data;
using MySqlConnector;
using Dapper;

var builder = WebApplication.CreateBuilder(args);

// CORS
builder.Services.AddCors(o => o.AddPolicy("dev",
    p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

// IMPORTANTE: usar Transient para evitar reuso concurrente de la misma conexión
var connStr = builder.Configuration.GetConnectionString("MySql");
builder.Services.AddTransient<IDbConnection>(_ => new MySqlConnection(connStr));

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
app.UseCors("dev");
app.UseSwagger();
app.UseSwaggerUI();

app.MapGet("/api/health", () => Results.Ok(new { ok = true, ts = DateTime.UtcNow }));

// Helpers
static (string axis, string end) MapDir(string d) => d switch
{
    "LEFT" => ("ROW", "MIN"),
    "RIGHT" => ("ROW", "MAX"),
    "TOP" => ("COL", "MIN"),
    "BOTTOM" => ("COL", "MAX"),
    _ => ("ROW", "MIN")
};

static (int r, int c) ToRowCol(int idx) => (idx / 5 + 1, idx % 5 + 1);

// ------------------- ENDPOINTS -------------------

// Crear partida
app.MapPost("/api/games", async (IDbConnection db, CreateGameDto dto) =>
{
    try
    {
        var gameId = await db.ExecuteScalarAsync<long>(
            "INSERT INTO games (mode) VALUES (@Mode); SELECT LAST_INSERT_ID();",
            new { dto.Mode });

        if (dto.Mode == "DUO")
        {
            if (dto.PlayerTopId == null || dto.PlayerBottomId == null)
                return Results.BadRequest("DUO requiere playerTopId y playerBottomId");

            await db.ExecuteAsync(@"
INSERT INTO game_participants
(game_id, seat, player_id, team, symbol_at_game, turn_order)
VALUES
(@gid,'TOP', @pTop, NULL, 'CIRCLE', 1),
(@gid,'BOTTOM', @pBot, NULL, 'CROSS', 2);",
                new { gid = gameId, pTop = dto.PlayerTopId, pBot = dto.PlayerBottomId });
        }
        else if (dto.Mode == "QUARTET")
        {
            if (dto.PlayerTopId == null || dto.PlayerRightId == null ||
                dto.PlayerBottomId == null || dto.PlayerLeftId == null)
                return Results.BadRequest("QUARTET requiere los 4 asientos");

            await db.ExecuteAsync(@"
INSERT INTO game_participants
(game_id, seat, player_id, team, symbol_at_game, turn_order)
VALUES
(@gid,'TOP', @top, 'A','CIRCLE',1),
(@gid,'RIGHT', @right,'B','CROSS',2),
(@gid,'BOTTOM', @bottom,'A','CIRCLE',3),
(@gid,'LEFT',  @left, 'B','CROSS',4);",
                new {
                    gid = gameId,
                    top = dto.PlayerTopId,
                    right = dto.PlayerRightId,
                    bottom = dto.PlayerBottomId,
                    left = dto.PlayerLeftId
                });
        }
        else return Results.BadRequest("mode debe ser DUO o QUARTET");

        return Results.Ok(new { id = gameId });
    }
    catch (Exception ex)
    {
        return Results.Problem(title: "DB error (create game)", detail: ex.Message);
    }
});

// Registrar movimiento
app.MapPost("/api/games/{gameId:long}/moves", async (IDbConnection db, long gameId, CreateMoveDto dto) =>
{
    try
    {
        var gp = await db.QueryFirstOrDefaultAsync<(string team, long player_id)>(@"
SELECT team, player_id FROM game_participants
WHERE game_id=@gid AND seat=@seat;", new { gid = gameId, seat = dto.ActorSeat });

        var moveNo = await db.ExecuteScalarAsync<int>(
            "SELECT COALESCE(MAX(move_no),0)+1 FROM moves WHERE game_id=@gid;",
            new { gid = gameId });

        var (axis, end) = MapDir(dto.PushDirection);
        var (remR, remC) = ToRowCol(dto.PickedIndex);
        var placedIndex = axis == "ROW" ? (dto.PlacedIndex % 5) + 1 : (dto.PlacedIndex / 5) + 1;

        await db.ExecuteAsync(@"
INSERT INTO moves
(game_id, move_no, played_by, played_seat, played_team,
 removed_row, removed_col, placed_axis, placed_index, placed_end,
 result_symbol, result_dot_dir, caused_win, caused_loss_by_opponent_line, created_at)
VALUES
(@gid, @no, @pid, @seat, @team,
 @remR, @remC, @axis, @pIndex, @pEnd,
 @sym, @dot, @win, @lose, NOW());",
            new {
                gid = gameId,
                no = moveNo,
                pid = gp.player_id,
                seat = dto.ActorSeat,
                team = gp.team,
                remR,
                remC,
                axis,
                pIndex = placedIndex,
                pEnd = end,
                sym = dto.Symbol,
                dot = dto.DotOrientation,
                win = dto.CausedWin,
                lose = dto.CausedLose
            });

        await db.ExecuteAsync(@"
INSERT INTO move_state (game_id, move_no, board)
VALUES (@gid, @no, @board);",
            new { gid = gameId, no = moveNo, board = dto.BoardJson });

        return Results.Ok(new { moveNo });
    }
    catch (Exception ex)
    {
        return Results.Problem(title: "DB error (move)", detail: ex.Message);
    }
});

// Finalizadas
app.MapGet("/api/games/finished", async (IDbConnection db) =>
{
    var rows = await db.QueryAsync("SELECT * FROM v_finished_games;");
    return Results.Ok(rows);
});

// Replay
app.MapGet("/api/games/{gameId:long}/replay", async (IDbConnection db, long gameId) =>
{
    var game = await db.QueryFirstOrDefaultAsync("SELECT * FROM games WHERE game_id=@id", new { id = gameId });
    if (game == null) return Results.NotFound();

    var participants = await db.QueryAsync(@"
SELECT * FROM game_participants
WHERE game_id=@id
ORDER BY turn_order;", new { id = gameId });

    var moves = await db.QueryAsync(@"
SELECT m.*, s.board AS board_json
FROM moves m
LEFT JOIN move_state s 
  ON s.game_id=m.game_id AND s.move_no=m.move_no
WHERE m.game_id=@id
ORDER BY m.move_no;", new { id = gameId });

    return Results.Ok(new { game, participants, moves });
});

// Stats DUO
app.MapGet("/api/stats/duo", async (IDbConnection db) =>
{
    try { return Results.Ok(await db.QueryAsync("CALL sp_stats_duo();")); }
    catch
    {
        var rows = await db.QueryAsync(@"
SELECT pl.player_id,
       pl.display_name AS jugador,
       SUM((g.winner_team = gp.team) * 1) AS ganadas,
       COUNT(*) AS played_cnt,
       ROUND(100 * SUM((g.winner_team = gp.team) * 1) / NULLIF(COUNT(*),0), 2) AS efectividad_pct
FROM players pl
JOIN game_participants gp ON gp.player_id = pl.player_id
JOIN games g ON g.game_id = gp.game_id
WHERE g.mode='DUO' AND g.status='FINISHED'
GROUP BY pl.player_id, pl.display_name
ORDER BY efectividad_pct DESC, ganadas DESC;");
        return Results.Ok(rows);
    }
});

// Stats QUARTET
app.MapGet("/api/stats/quartet", async (IDbConnection db) =>
{
    try { return Results.Ok(await db.QueryAsync("CALL sp_stats_quartet();")); }
    catch
    {
        var rows = await db.QueryAsync(@"
SELECT 
    g.winner_team AS equipo,
    COUNT(*) AS ganadas,
    (SELECT COUNT(*) FROM games x WHERE x.mode='QUARTET' AND x.status='FINISHED') AS played_cnt,
    ROUND(100 * COUNT(*) / NULLIF(
        (SELECT COUNT(*) FROM games x WHERE x.mode='QUARTET' AND x.status='FINISHED'),
        0
    ), 2) AS efectividad_pct
FROM games g
WHERE g.mode='QUARTET' 
  AND g.status='FINISHED' 
  AND g.winner_team IS NOT NULL
GROUP BY g.winner_team;");
        return Results.Ok(rows);
    }
});

app.MapGet("/", () => Results.Redirect("/swagger"));
app.Run();

// DTOs
public record CreateGameDto(string Mode, long? PlayerTopId, long? PlayerRightId, long? PlayerBottomId, long? PlayerLeftId);
public record CreateMoveDto(int TurnNumber, string ActorSeat, int PickedIndex, string PushDirection, int PlacedIndex,
                            string Symbol, string DotOrientation, bool CausedWin, bool CausedLose, string BoardJson);

