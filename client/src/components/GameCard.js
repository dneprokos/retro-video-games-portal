import React from "react";
import { Link } from "react-router-dom";
import { Calendar, Users, Star, Gamepad2 } from "lucide-react";

const GameCard = ({ game }) => {
  const [imgError, setImgError] = React.useState(false);

  const hasImage = game.imageUrl && !imgError;

  const getPlatformsText = (platforms) => {
    if (!platforms || platforms.length === 0) {
      return "No platforms";
    }
    if (platforms.length <= 2) {
      return platforms.join(", ");
    }
    return `${platforms.slice(0, 2).join(", ")} +${platforms.length - 2} more`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).getFullYear();
  };

  return (
    <Link to={`/game/${game._id}`}>
      <div className="game-card group" data-testid="game-card">
        {/* Game Image or Placeholder */}
        <div className="relative overflow-hidden rounded-lg mb-4 w-full h-48 flex items-center justify-center bg-arcade-card">
          {hasImage ? (
            <img
              src={game.imageUrl}
              alt={game.name}
              className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-300"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full text-center">
              <Gamepad2 className="h-12 w-12 text-neon-pink mb-2 animate-bounce" />
              <span className="text-arcade-text text-sm opacity-80">
                No Image Available
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>

        {/* Game Info */}
        <div className="space-y-3">
          {/* Title */}
          <h3
            className="text-lg font-bold text-neon-pink group-hover:text-neon-blue transition-colors duration-300"
            data-testid="game-name"
          >
            {game.name}
          </h3>

          {/* Genre */}
          <div className="flex items-center space-x-2">
            <Gamepad2 className="h-4 w-4 text-neon-green" />
            <span className="text-arcade-text text-sm" data-testid="game-genre">
              {game.genre}
            </span>
          </div>

          {/* Release Year */}
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-neon-blue" />
            <span
              className="text-arcade-text text-sm"
              data-testid="game-release-date"
            >
              {formatDate(game.releaseDate)}
            </span>
          </div>

          {/* Platforms */}
          <div className="flex items-center space-x-2">
            <Gamepad2 className="h-4 w-4 text-neon-yellow" />
            <span
              className="text-arcade-text text-sm"
              data-testid="game-platforms"
            >
              {getPlatformsText(game.platforms)}
            </span>
          </div>

          {/* Multiplayer */}
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-neon-purple" />
            <span
              className="text-arcade-text text-sm"
              data-testid="game-multiplayer"
            >
              {game.hasMultiplayer ? "Multiplayer" : "Single Player"}
            </span>
          </div>

          {/* Rating */}
          {game.rating && (
            <div
              className="flex items-center space-x-2"
              data-testid="game-rating"
            >
              <Star
                className="h-4 w-4 text-neon-yellow fill-current"
                data-testid="game-rating"
              />
              <span
                className="text-arcade-text text-sm"
                data-testid="game-rating-value"
              >
                {game.rating}/10
              </span>
            </div>
          )}

          {/* More Details Button */}
          <div className="pt-2">
            <span className="text-neon-pink text-sm font-bold group-hover:text-neon-blue transition-colors duration-300">
              More Details →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default GameCard;
