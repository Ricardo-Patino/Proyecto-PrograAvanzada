-- 0) Config inicial
SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET sql_notes = 0;

-- 1) Base y modo estricto
CREATE DATABASE IF NOT EXISTS quixo
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE quixo;

-- 2) Limpieza
DROP VIEW IF EXISTS v_finished_games;
DROP VIEW IF EXISTS v_games_overview;

DROP TRIGGER IF EXISTS trg_moves_close_game;
DROP TRIGGER IF EXISTS trg_games_winner_guard_bi;
DROP TRIGGER IF EXISTS trg_games_winner_guard_bu;
DROP TRIGGER IF EXISTS trg_gp_team_guard_bi;
DROP TRIGGER IF EXISTS trg_gp_team_guard_bu;

DROP PROCEDURE IF EXISTS sp_stats_duo;
DROP PROCEDURE IF EXISTS sp_stats_quartet;
DROP PROCEDURE IF EXISTS sp_get_game_xml;

DROP TABLE IF EXISTS move_state;
DROP TABLE IF EXISTS moves;
DROP TABLE IF EXISTS game_participants;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS players;

-- ========================================================
-- 3) Tablas y tipos 
-- ========================================================

-- Jugadores
CREATE TABLE players (
  player_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  display_name  VARCHAR(120)    NOT NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id),
  UNIQUE KEY uq_players_display_name (display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Partidas
CREATE TABLE games (
  game_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mode         ENUM('DUO','QUARTET') NOT NULL,
  status       ENUM('IN_PROGRESS','FINISHED','ABORTED') NOT NULL DEFAULT 'IN_PROGRESS',
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at     TIMESTAMP NULL DEFAULT NULL,
  winner_player_id BIGINT UNSIGNED NULL,
  winner_team  ENUM('A','B') NULL,
  loser_made_opponent_line BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (game_id),
  KEY ix_games_status_created (status, created_at DESC),
  CONSTRAINT fk_games_winner_player
    FOREIGN KEY (winner_player_id) REFERENCES players(player_id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  -- Regla (documental): DUO => winner_team NULL; QUARTET => winner_player_id NULL.
  -- Se valida mediante triggers BEFORE INSERT/UPDATE.
  CHECK (mode IN ('DUO','QUARTET')),
  CHECK (status IN ('IN_PROGRESS','FINISHED','ABORTED')),
  CHECK ((winner_team IS NULL) OR (winner_team IN ('A','B')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Participantes por partida y asiento
CREATE TABLE game_participants (
  game_id        BIGINT UNSIGNED NOT NULL,
  seat           ENUM('TOP','RIGHT','BOTTOM','LEFT') NOT NULL,
  player_id      BIGINT UNSIGNED NOT NULL,
  team           ENUM('A','B') NULL, -- NULL en DUO; A/B en QUARTET
  symbol_at_game ENUM('NEUTRAL','CIRCLE','CROSS') NOT NULL,
  turn_order     TINYINT UNSIGNED NOT NULL, -- 1..2 o 1..4
  PRIMARY KEY (game_id, seat),
  UNIQUE KEY uq_gp_game_player (game_id, player_id),
  KEY ix_gp_player (player_id),
  CONSTRAINT fk_gp_game  FOREIGN KEY (game_id)  REFERENCES games(game_id)   ON DELETE CASCADE,
  CONSTRAINT fk_gp_player FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE RESTRICT,
  CHECK (seat IN ('TOP','RIGHT','BOTTOM','LEFT')),
  CHECK (symbol_at_game IN ('NEUTRAL','CIRCLE','CROSS')),
  CHECK (turn_order BETWEEN 1 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historial de jugadas
CREATE TABLE moves (
  game_id          BIGINT UNSIGNED NOT NULL,
  move_no          INT UNSIGNED    NOT NULL,                      -- 1..N
  played_by        BIGINT UNSIGNED NOT NULL,
  played_seat      ENUM('TOP','RIGHT','BOTTOM','LEFT') NOT NULL,
  played_team      ENUM('A','B') NULL,                            -- NULL en DUO
  removed_row      TINYINT UNSIGNED NOT NULL,
  removed_col      TINYINT UNSIGNED NOT NULL,
  placed_axis      ENUM('ROW','COL') NOT NULL,
  placed_index     TINYINT UNSIGNED NOT NULL,
  placed_end       ENUM('MIN','MAX') NOT NULL,
  result_symbol    ENUM('CIRCLE','CROSS') NOT NULL,               -- resultado siempre jugador
  result_dot_dir   ENUM('TOP','RIGHT','BOTTOM','LEFT') NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  caused_win       BOOLEAN NOT NULL DEFAULT FALSE,
  caused_loss_by_opponent_line BOOLEAN NOT NULL DEFAULT FALSE,
  notes            TEXT NULL,
  PRIMARY KEY (game_id, move_no),
  KEY ix_moves_game (game_id, move_no),
  KEY ix_moves_player (played_by),
  CONSTRAINT fk_moves_game   FOREIGN KEY (game_id)   REFERENCES games(game_id)   ON DELETE CASCADE,
  CONSTRAINT fk_moves_player FOREIGN KEY (played_by) REFERENCES players(player_id) ON DELETE RESTRICT,
  CHECK (removed_row BETWEEN 1 AND 5),
  CHECK (removed_col BETWEEN 1 AND 5),
  CHECK (placed_index BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Snapshot opcional del tablero (5x5) después de cada jugada, como JSON
CREATE TABLE move_state (
  game_id BIGINT UNSIGNED NOT NULL,
  move_no INT UNSIGNED NOT NULL,
  board   LONGTEXT NOT NULL,   -- ← aquí cambiamos JSON por LONGTEXT
  PRIMARY KEY (game_id, move_no),
  CONSTRAINT fk_mstate_move
    FOREIGN KEY (game_id, move_no)
    REFERENCES moves(game_id, move_no)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



-- ========================================================
-- 4) Triggers de validación y cierre de partida
-- ========================================================

DELIMITER $$

-- Enforce: DUO => winner_team IS NULL; QUARTET => winner_player_id IS NULL
CREATE TRIGGER trg_games_winner_guard_bi
BEFORE INSERT ON games
FOR EACH ROW
BEGIN
  IF NEW.mode = 'DUO' THEN
    IF NEW.winner_team IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DUO: winner_team debe ser NULL';
    END IF;
  ELSEIF NEW.mode = 'QUARTET' THEN
    IF NEW.winner_player_id IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QUARTET: winner_player_id debe ser NULL';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_games_winner_guard_bu
BEFORE UPDATE ON games
FOR EACH ROW
BEGIN
  IF NEW.mode = 'DUO' THEN
    IF NEW.winner_team IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DUO: winner_team debe ser NULL';
    END IF;
  ELSEIF NEW.mode = 'QUARTET' THEN
    IF NEW.winner_player_id IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QUARTET: winner_player_id debe ser NULL';
    END IF;
  END IF;
END$$

-- Enforce: en DUO team debe ser NULL; en QUARTET team debe ser A/B
CREATE TRIGGER trg_gp_team_guard_bi
BEFORE INSERT ON game_participants
FOR EACH ROW
BEGIN
  DECLARE v_mode ENUM('DUO','QUARTET');
  SELECT mode INTO v_mode FROM games WHERE game_id = NEW.game_id;
  IF v_mode = 'DUO' THEN
    IF NEW.team IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DUO: game_participants.team debe ser NULL';
    END IF;
  ELSE
    IF NEW.team IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QUARTET: game_participants.team NO puede ser NULL';
    END IF;
  END IF;
  -- En participación, el símbolo útil es CIRCLE/CROSS (NEUTRAL no tiene sentido como “asignado”)
  IF NEW.symbol_at_game = 'NEUTRAL' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'symbol_at_game debe ser CIRCLE o CROSS';
  END IF;
END$$

CREATE TRIGGER trg_gp_team_guard_bu
BEFORE UPDATE ON game_participants
FOR EACH ROW
BEGIN
  DECLARE v_mode ENUM('DUO','QUARTET');
  SELECT mode INTO v_mode FROM games WHERE game_id = NEW.game_id;
  IF v_mode = 'DUO' THEN
    IF NEW.team IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'DUO: game_participants.team debe ser NULL';
    END IF;
  ELSE
    IF NEW.team IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QUARTET: game_participants.team NO puede ser NULL';
    END IF;
  END IF;
  IF NEW.symbol_at_game = 'NEUTRAL' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'symbol_at_game debe ser CIRCLE o CROSS';
  END IF;
END$$

-- Cerrar partida automáticamente si una jugada causó victoria
CREATE TRIGGER trg_moves_close_game
AFTER INSERT ON moves
FOR EACH ROW
BEGIN
  IF NEW.caused_win = TRUE OR NEW.caused_loss_by_opponent_line = TRUE THEN
    UPDATE games
       SET status   = 'FINISHED',
           ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP)
     WHERE game_id  = NEW.game_id;
  END IF;
END$$

DELIMITER ;

-- ========================================================
-- 5) Vistas de apoyo
-- ========================================================

CREATE OR REPLACE VIEW v_games_overview AS
SELECT
  g.game_id,
  g.mode,
  g.status,
  g.created_at,
  g.started_at,
  g.ended_at,
  TIMESTAMPDIFF(SECOND, g.started_at, COALESCE(g.ended_at, CURRENT_TIMESTAMP)) AS duration_seconds,
  g.winner_player_id,
  g.winner_team,
  g.loser_made_opponent_line
FROM games g;

CREATE OR REPLACE VIEW v_finished_games AS
SELECT *
FROM v_games_overview
WHERE status = 'FINISHED'
ORDER BY created_at DESC;

-- ========================================================
-- 6) Procedimientos de estadísticas
-- ========================================================

DELIMITER $$

-- Efectividad por jugador (DUO)
CREATE PROCEDURE sp_stats_duo()
BEGIN
  SELECT
    p.player_id,
    pl.display_name AS jugador,
    IFNULL(w.wins_cnt,0) AS ganadas,
    p.played_cnt,
    CASE WHEN p.played_cnt>0
      THEN ROUND(100.0 * IFNULL(w.wins_cnt,0) / p.played_cnt, 2)
      ELSE 0 END AS efectividad_pct
  FROM (
    -- Jugadores que participaron en partidas DUO finalizadas
    SELECT gp.player_id, COUNT(*) AS played_cnt
    FROM game_participants gp
    JOIN games g ON g.game_id = gp.game_id
    WHERE g.mode='DUO'
      AND g.status='FINISHED'
    GROUP BY gp.player_id
  ) AS p
  JOIN players pl ON pl.player_id = p.player_id
  LEFT JOIN (
    -- Ganadores en partidas DUO
    SELECT g.winner_player_id AS player_id, COUNT(*) AS wins_cnt
    FROM games g
    WHERE g.mode='DUO'
      AND g.status='FINISHED'
      AND g.winner_player_id IS NOT NULL
    GROUP BY g.winner_player_id
  ) AS w ON w.player_id = p.player_id
  ORDER BY efectividad_pct DESC, ganadas DESC, jugador;
END$$

DELIMITER $$

-- Efectividad por equipo (QUARTET)
CREATE PROCEDURE sp_stats_quartet()
BEGIN
  -- q: partidas QUARTET finalizadas
  -- tot: total de partidas q
  -- wins: ganadas por equipo sobre q
  SELECT
    w.team AS equipo,
    ROUND(100.0 * w.ganadas / NULLIF(t.total,0), 2) AS efectividad_pct,
    w.ganadas
  FROM (
    SELECT winner_team AS team, COUNT(*) AS ganadas
    FROM games
    WHERE mode='QUARTET' AND status='FINISHED'
    GROUP BY winner_team
  ) AS w
  CROSS JOIN (
    SELECT COUNT(*) AS total
    FROM games
    WHERE mode='QUARTET' AND status='FINISHED'
  ) AS t
  ORDER BY equipo;
END$$

-- Exportar XML de una partida completa (estructura simple)
CREATE PROCEDURE sp_get_game_xml(IN p_game_id BIGINT UNSIGNED)
BEGIN
  -- Aumentar tamaño para concatenaciones largas
  SET SESSION group_concat_max_len = 1024 * 1024;

  -- Cabecera de la partida
  SELECT CONCAT(
    '<game id="', g.game_id, '" mode="', g.mode, '" status="', g.status, '">',
      '<created_at>', COALESCE(DATE_FORMAT(g.created_at, '%Y-%m-%dT%H:%i:%sZ'), ''), '</created_at>',
      '<started_at>', COALESCE(DATE_FORMAT(g.started_at, '%Y-%m-%dT%H:%i:%sZ'), ''), '</started_at>',
      '<ended_at>',   COALESCE(DATE_FORMAT(g.ended_at,   '%Y-%m-%dT%H:%i:%sZ'), ''), '</ended_at>',
      IF(g.mode='DUO',
        CONCAT('<winner_player_id>', COALESCE(g.winner_player_id,''), '</winner_player_id>'),
        CONCAT('<winner_team>', COALESCE(g.winner_team,''), '</winner_team>')
      ),
      '<loser_made_opponent_line>', IF(g.loser_made_opponent_line, 'true','false'), '</loser_made_opponent_line>',
      '<participants>',
        (SELECT GROUP_CONCAT(
            CONCAT(
              '<participant seat="', gp.seat, '" turn="', gp.turn_order, '"',
              IFNULL(CONCAT(' team="', gp.team, '"'), ''),
              ' symbol="', gp.symbol_at_game, '">',
                '<player id="', pl.player_id, '">', XML_ESCAPE(pl.display_name), '</player>',
              '</participant>'
            )
            ORDER BY gp.turn_order SEPARATOR ''
        )
         FROM game_participants gp
         JOIN players pl ON pl.player_id = gp.player_id
         WHERE gp.game_id = g.game_id
        ),
      '</participants>',
      '<moves>',
        (SELECT IFNULL(GROUP_CONCAT(
          CONCAT(
            '<move no="', m.move_no, '" seat="', m.played_seat, '"',
            IFNULL(CONCAT(' team="', m.played_team, '"'), ''),
            ' removed_row="', m.removed_row, '" removed_col="', m.removed_col, '"',
            ' placed_axis="', m.placed_axis, '" placed_index="', m.placed_index, '" placed_end="', m.placed_end, '"',
            ' symbol="', m.result_symbol, '" dot="', m.result_dot_dir, '">',
              '<played_by id="', m.played_by, '"/>',
              '<created_at>', DATE_FORMAT(m.created_at, '%Y-%m-%dT%H:%i:%sZ'), '</created_at>',
              '<flags win="', IF(m.caused_win,'true','false'), '" loseByOppLine="', IF(m.caused_loss_by_opponent_line,'true','false'), '"/>',
              IFNULL(CONCAT('<notes>', XML_ESCAPE(m.notes), '</notes>'), ''),
            '</move>'
          )
          ORDER BY m.move_no SEPARATOR ''
        ), '')
        FROM moves m
        WHERE m.game_id = g.game_id),
      '</moves>',
    '</game>'
  ) AS game_xml
  FROM games g
  WHERE g.game_id = p_game_id;
END$$

DELIMITER ;

DROP VIEW IF EXISTS xml_escape_helper;
CREATE VIEW xml_escape_helper AS SELECT 1 AS dummy; -- marcador

-- ========================================================
-- 7) Datos de ejemplo (seed)
-- ========================================================

INSERT INTO players(display_name) VALUES ('Jugador 1'), ('Jugador 2'), ('Jugador 3'), ('Jugador 4');

-- Partida DUO de ejemplo
INSERT INTO games(mode) VALUES ('DUO');        -- game_id = 1

-- Asignaciones DUO: TOP (CIRCLE), BOTTOM (CROSS)
INSERT INTO game_participants(game_id, seat, player_id, team, symbol_at_game, turn_order)
VALUES
  (1,'TOP',    1, NULL, 'CIRCLE', 1),
  (1,'BOTTOM', 2, NULL, 'CROSS',  2);

-- Un par de jugadas simuladas
INSERT INTO moves
(game_id, move_no, played_by, played_seat, played_team,
 removed_row, removed_col, placed_axis, placed_index, placed_end,
 result_symbol, result_dot_dir, notes)
VALUES
(1,1, 1,'TOP',    NULL, 1,1,'ROW',1,'MAX','CIRCLE','TOP',   'Primera jugada'),
(1,2, 2,'BOTTOM', NULL, 5,5,'COL',5,'MIN','CROSS', 'BOTTOM','Respuesta');

-- Marcar victoria en la 3ra jugada (solo ejemplo)
INSERT INTO moves
(game_id, move_no, played_by, played_seat, played_team,
 removed_row, removed_col, placed_axis, placed_index, placed_end,
 result_symbol, result_dot_dir, caused_win, notes)
VALUES
(1,3, 1,'TOP', NULL, 2,5,'ROW',2,'MIN','CIRCLE','RIGHT', TRUE, 'Jugada ganadora');

SET sql_notes = 1;
