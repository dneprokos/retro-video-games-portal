import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { Plus, Edit, Trash2, Gamepad2, Loader2 } from "lucide-react";
import GameForm from "../components/GameForm";

const AdminPanel = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGame, setEditingGame] = useState(null);

  useEffect(() => {
    fetchGames();
  }, []);

  // Check if we should open edit form from navigation
  useEffect(() => {
    const editGameId = searchParams.get("edit");

    if (editGameId) {
      // First try to find the game in the loaded games
      if (games.length > 0) {
        const gameToEdit = games.find((game) => game._id === editGameId);
        if (gameToEdit) {
          setEditingGame(gameToEdit);
          // Clear the URL parameter to prevent re-opening on re-render
          setSearchParams({});
          return;
        }
      }

      // If game not found in loaded games, fetch it directly
      const fetchGameForEdit = async () => {
        try {
          const response = await axios.get(`/api/games/${editGameId}`);
          setEditingGame(response.data.game);
          // Clear the URL parameter to prevent re-opening on re-render
          setSearchParams({});
        } catch (error) {
          console.error("Error fetching game for editing:", error);
          toast.error("Failed to load game for editing");
        }
      };

      fetchGameForEdit();
    }
  }, [searchParams, games, setSearchParams]);

  const fetchGames = async () => {
    try {
      setLoading(true);
      // Request all games without pagination for admin panel
      const response = await axios.get("/api/games?limit=1000&page=1");
      setGames(response.data.games);
    } catch (error) {
      console.error("Error fetching games:", error);
      toast.error("Failed to load games");
    } finally {
      setLoading(false);
    }
  };

  const handleAddGame = async (gameData) => {
    try {
      await axios.post("/api/games", gameData);
      toast.success("Game added successfully");
      setShowAddForm(false);
      fetchGames();
    } catch (error) {
      console.error("Error adding game:", error);
      const message = error.response?.data?.message || "Failed to add game";
      toast.error(message);
    }
  };

  const handleEditGame = async (gameData) => {
    try {
      await axios.put(`/api/games/${editingGame._id}`, gameData);
      toast.success("Game updated successfully");
      setEditingGame(null);
      fetchGames();
    } catch (error) {
      console.error("Error updating game:", error);
      const message = error.response?.data?.message || "Failed to update game";
      toast.error(message);
    }
  };

  const handleDeleteGame = async (gameId) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this game? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      await axios.delete(`/api/games/${gameId}`);
      toast.success("Game deleted successfully");
      fetchGames();
    } catch (error) {
      console.error("Error deleting game:", error);
      toast.error("Failed to delete game");
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).getFullYear();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <Loader2 className="loading-spinner mx-auto mb-4" />
          <p className="text-arcade-text">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="neon-text text-3xl font-arcade mb-2">ADMIN PANEL</h1>
          <p className="text-arcade-text">Manage retro games in the portal</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="retro-button flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Game</span>
        </button>
      </div>

      {/* Add Game Form */}
      {showAddForm && (
        <div className="retro-card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-arcade text-neon-pink">Add New Game</h2>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-arcade-text hover:text-neon-pink transition-colors duration-300"
            >
              ✕
            </button>
          </div>
          <GameForm
            onSubmit={handleAddGame}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Edit Game Form */}
      {editingGame && (
        <div className="retro-card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-arcade text-neon-pink">Edit Game</h2>
            <button
              onClick={() => setEditingGame(null)}
              className="text-arcade-text hover:text-neon-pink transition-colors duration-300"
            >
              ✕
            </button>
          </div>
          <GameForm
            game={editingGame}
            onSubmit={handleEditGame}
            onCancel={() => setEditingGame(null)}
          />
        </div>
      )}

      {/* Games List */}
      <div className="retro-card">
        <h2 className="text-xl font-arcade text-neon-pink mb-4">
          Games Management
        </h2>

        {games.length === 0 ? (
          <div className="text-center py-8">
            <Gamepad2 className="h-16 w-16 text-arcade-border mx-auto mb-4" />
            <p className="text-arcade-text">
              No games found. Add your first game!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" id="games-list">
              <thead>
                <tr className="border-b border-arcade-border">
                  <th className="text-left py-3 px-4 text-neon-pink font-bold">
                    Game
                  </th>
                  <th className="text-left py-3 px-4 text-neon-pink font-bold">
                    Genre
                  </th>
                  <th className="text-left py-3 px-4 text-neon-pink font-bold">
                    Year
                  </th>
                  <th className="text-left py-3 px-4 text-neon-pink font-bold">
                    Platforms
                  </th>
                  <th className="text-left py-3 px-4 text-neon-pink font-bold">
                    Multiplayer
                  </th>
                  <th className="text-left py-3 px-4 text-neon-pink font-bold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => (
                  <tr
                    key={game._id}
                    className="border-b border-arcade-border hover:bg-arcade-border/20"
                  >
                    <td className="py-3 px-4">
                      <Link
                        to={`/game/${game._id}`}
                        className="text-neon-pink hover:text-neon-blue transition-colors duration-300 font-bold"
                      >
                        {game.name}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-arcade-text">{game.genre}</td>
                    <td className="py-3 px-4 text-arcade-text">
                      {formatDate(game.releaseDate)}
                    </td>
                    <td className="py-3 px-4 text-arcade-text">
                      <div className="flex flex-wrap gap-1">
                        {game.platforms.slice(0, 2).map((platform) => (
                          <span
                            key={platform}
                            className="bg-arcade-border text-arcade-text px-2 py-1 rounded text-xs"
                          >
                            {platform}
                          </span>
                        ))}
                        {game.platforms.length > 2 && (
                          <span className="text-arcade-text text-xs">
                            +{game.platforms.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-arcade-text">
                      {game.hasMultiplayer ? "Yes" : "No"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            console.log(
                              "DEBUG: Edit button clicked for game:",
                              game
                            );
                            setEditingGame(game);
                          }}
                          className="text-neon-blue hover:text-neon-pink transition-colors duration-300"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGame(game._id)}
                          className="text-red-400 hover:text-red-300 transition-colors duration-300"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
