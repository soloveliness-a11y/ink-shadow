import { useGameStore } from '../store/game.js';

interface Props {
  nickname: string;
  onJoinRoom: (roomCode: string) => void;
}

export function PublicRoomList({ nickname, onJoinRoom }: Props) {
  const publicRooms = useGameStore((s) => s.publicRooms);
  const send = useGameStore((s) => s.send);
  const conn = useGameStore((s) => s.conn);

  const handleBrowse = () => {
    if (!conn) return;
    send({ kind: 'listRooms' });
  };

  return (
    <div className="public-rooms">
      <button onClick={handleBrowse} className="btn btn-secondary btn-block" type="button">
        浏览公开房间
      </button>

      {publicRooms.length > 0 && (
        <div className="public-rooms-list">
          {publicRooms.map((room) => (
            <button
              key={room.roomCode}
              className="public-room-card"
              onClick={() => onJoinRoom(room.roomCode)}
              disabled={!nickname.trim()}
              title={!nickname.trim() ? '先填写昵称' : `加入房间 ${room.roomCode}`}
            >
              <div className="public-room-header">
                <span className="public-room-code">{room.roomCode}</span>
                <span className="public-room-count">
                  {room.playerCount}/{room.maxPlayers}
                </span>
              </div>
              <div className="public-room-script">{room.scriptTitle}</div>
              <div className="public-room-host">房主: {room.hostName}</div>
            </button>
          ))}
        </div>
      )}

      {publicRooms.length === 0 && (
        <p className="public-rooms-empty">暂无公开房间,自己开一局吧!</p>
      )}
    </div>
  );
}
