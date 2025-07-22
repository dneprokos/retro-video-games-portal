import React from 'react';
import { render, screen, fireEvent } from '../test-utils';
import GameCard from './GameCard';
import { mockGame } from '../test-utils';

describe('GameCard', () => {
  const defaultGame = mockGame;

  it('renders game information correctly', () => {
    render(<GameCard game={defaultGame} />);

    // Check if game name is displayed
    expect(screen.getByText('Super Mario Bros')).toBeInTheDocument();

    // Check if genre is displayed
    expect(screen.getByText('Platformer')).toBeInTheDocument();

    // Check if release year is displayed
    expect(screen.getByText('1985')).toBeInTheDocument();

    // Check if platforms are displayed
    expect(screen.getByText('NES')).toBeInTheDocument();

    // Check if multiplayer status is displayed
    expect(screen.getByText('Single Player')).toBeInTheDocument();

    // Check if rating is displayed
    expect(screen.getByText('9.5/10')).toBeInTheDocument();

    // Check if "More Details" link is present
    expect(screen.getByText('More Details →')).toBeInTheDocument();
  });

  it('renders game image when imageUrl is provided', () => {
    render(<GameCard game={defaultGame} />);

    const image = screen.getByAltText('Super Mario Bros');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/mario.jpg');
  });

  it('renders placeholder when no imageUrl is provided', () => {
    const gameWithoutImage = { ...defaultGame, imageUrl: null };
    render(<GameCard game={gameWithoutImage} />);

    expect(screen.getByText('No Image Available')).toBeInTheDocument();
    expect(screen.queryByAltText('Super Mario Bros')).not.toBeInTheDocument();
  });

  it('renders placeholder when image fails to load', () => {
    render(<GameCard game={defaultGame} />);

    const image = screen.getByAltText('Super Mario Bros');
    
    // Simulate image load error
    fireEvent.error(image);

    expect(screen.getByText('No Image Available')).toBeInTheDocument();
  });

  it('displays multiplayer status correctly', () => {
    const multiplayerGame = { ...defaultGame, hasMultiplayer: true };
    render(<GameCard game={multiplayerGame} />);

    expect(screen.getByText('Multiplayer')).toBeInTheDocument();
  });

  it('displays single player status correctly', () => {
    render(<GameCard game={defaultGame} />);

    expect(screen.getByText('Single Player')).toBeInTheDocument();
  });

  it('handles multiple platforms correctly', () => {
    const multiPlatformGame = { 
      ...defaultGame, 
      platforms: ['NES', 'SNES', 'Game Boy', 'Arcade'] 
    };
    render(<GameCard game={multiPlatformGame} />);

    expect(screen.getByText('NES, SNES +2 more')).toBeInTheDocument();
  });

  it('handles two platforms without showing "+more"', () => {
    const twoPlatformGame = { 
      ...defaultGame, 
      platforms: ['NES', 'SNES'] 
    };
    render(<GameCard game={twoPlatformGame} />);

    expect(screen.getByText('NES, SNES')).toBeInTheDocument();
  });

  it('handles single platform correctly', () => {
    render(<GameCard game={defaultGame} />);

    expect(screen.getByText('NES')).toBeInTheDocument();
  });

  it('does not display rating when rating is not provided', () => {
    const gameWithoutRating = { ...defaultGame, rating: null };
    render(<GameCard game={gameWithoutRating} />);

    expect(screen.queryByText(/\/10/)).not.toBeInTheDocument();
  });

  it('displays rating with decimal places', () => {
    const gameWithDecimalRating = { ...defaultGame, rating: 8.7 };
    render(<GameCard game={gameWithDecimalRating} />);

    expect(screen.getByText('8.7/10')).toBeInTheDocument();
  });

  it('renders as a link to game details page', () => {
    render(<GameCard game={defaultGame} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/game/1');
  });

  it('applies correct CSS classes for styling', () => {
    render(<GameCard game={defaultGame} />);

    const gameCard = screen.getByText('Super Mario Bros').closest('.game-card');
    expect(gameCard).toHaveClass('game-card', 'group');
  });

  it('handles empty platforms array gracefully', () => {
    const gameWithNoPlatforms = { ...defaultGame, platforms: [] };
    render(<GameCard game={gameWithNoPlatforms} />);

    // Should display "No platforms" when platforms array is empty
    expect(screen.getByText('No platforms')).toBeInTheDocument();
  });

  it('formats date correctly for different years', () => {
    const oldGame = { 
      ...defaultGame, 
      releaseDate: '1980-01-01T00:00:00.000Z' 
    };
    render(<GameCard game={oldGame} />);

    expect(screen.getByText('1980')).toBeInTheDocument();
  });

  it('handles missing game properties gracefully', () => {
    const minimalGame = {
      _id: '1',
      name: 'Test Game',
      genre: 'Action',
      platforms: ['NES'],
      releaseDate: '1990-01-01T00:00:00.000Z',
      hasMultiplayer: false
    };
    render(<GameCard game={minimalGame} />);

    expect(screen.getByText('Test Game')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('1990')).toBeInTheDocument();
    expect(screen.getByText('Single Player')).toBeInTheDocument();
  });
}); 