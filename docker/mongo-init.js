// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'password', 'role'],
      properties: {
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        },
        password: {
          bsonType: 'string',
          minLength: 6
        },
        role: {
          enum: ['guest', 'admin', 'owner']
        }
      }
    }
  }
});

db.createCollection('games', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'genre', 'platforms', 'releaseDate', 'multiplayer'],
      properties: {
        name: {
          bsonType: 'string',
          minLength: 2,
          maxLength: 100
        },
        genre: {
          bsonType: 'string',
          enum: ['Action', 'Adventure', 'RPG', 'Strategy', 'Sports', 'Racing', 'Puzzle', 'Shooter', 'Simulation', 'Platformer', 'Fighting', 'Arcade', 'Other']
        },
        platforms: {
          bsonType: 'array',
          minItems: 1,
          items: {
            bsonType: 'string'
          }
        },
        releaseDate: {
          bsonType: 'date'
        },
        multiplayer: {
          bsonType: 'bool'
        },
        description: {
          bsonType: 'string',
          maxLength: 500
        },
        imageUrl: {
          bsonType: 'string'
        },
        rating: {
          bsonType: 'number',
          minimum: 0,
          maximum: 10
        }
      }
    }
  }
});

// Create indexes for better performance
db.users.createIndex({ email: 1 }, { unique: true });
db.games.createIndex({ name: 1 }, { unique: true });
db.games.createIndex({ genre: 1 });
db.games.createIndex({ platforms: 1 });
db.games.createIndex({ releaseDate: 1 });
db.games.createIndex({ multiplayer: 1 });

// Insert sample games data
db.games.insertMany([
  {
    name: "Super Mario Bros",
    genre: "Platformer",
    platforms: ["NES"],
    releaseDate: new Date("1985-09-13"),
    multiplayer: false,
    description: "The classic platformer that started it all. Guide Mario through the Mushroom Kingdom to rescue Princess Peach from Bowser.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/0/03/Super_Mario_Bros._box_art.jpg",
    rating: 9.5
  },
  {
    name: "The Legend of Zelda",
    genre: "Adventure",
    platforms: ["NES"],
    releaseDate: new Date("1986-02-21"),
    multiplayer: false,
    description: "An epic adventure in the land of Hyrule. Link must rescue Princess Zelda and defeat Ganon to restore peace.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/4/41/Legend_of_zelda_cover_%28with_cartridge%29_gold.png",
    rating: 9.8
  },
  {
    name: "Pac-Man",
    genre: "Arcade",
    platforms: ["Arcade", "NES", "Atari 2600"],
    releaseDate: new Date("1980-05-22"),
    multiplayer: false,
    description: "The iconic maze chase game. Guide Pac-Man through the maze while avoiding ghosts and eating dots.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/5/59/Pac-man.png",
    rating: 9.0
  },
  {
    name: "Donkey Kong",
    genre: "Platformer",
    platforms: ["Arcade", "NES"],
    releaseDate: new Date("1981-07-09"),
    multiplayer: false,
    description: "The game that introduced Mario (then Jumpman) to the world. Climb ladders and avoid barrels to rescue Pauline.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/1/1f/Donkey_Kong_arcade.png",
    rating: 8.8
  },
  {
    name: "Space Invaders",
    genre: "Shooter",
    platforms: ["Arcade", "Atari 2600"],
    releaseDate: new Date("1978-06-01"),
    multiplayer: false,
    description: "The classic space shooter that defined the genre. Defend Earth from waves of alien invaders.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/2/20/SpaceInvaders-Gameplay.jpg",
    rating: 8.5
  },
  {
    name: "Tetris",
    genre: "Puzzle",
    platforms: ["Game Boy", "NES", "Arcade"],
    releaseDate: new Date("1984-06-06"),
    multiplayer: false,
    description: "The addictive puzzle game where you arrange falling blocks to create complete lines.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/5/5c/Tetris_NES_cover_art.jpg",
    rating: 9.2
  },
  {
    name: "Street Fighter II",
    genre: "Fighting",
    platforms: ["Arcade", "SNES", "Genesis"],
    releaseDate: new Date("1991-02-06"),
    multiplayer: true,
    description: "The revolutionary fighting game that popularized the genre. Choose from 8 unique characters and battle it out.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/1/1f/Street_Fighter_II_arcade.png",
    rating: 9.3
  },
  {
    name: "Sonic the Hedgehog",
    genre: "Platformer",
    platforms: ["Sega Genesis"],
    releaseDate: new Date("1991-06-23"),
    multiplayer: false,
    description: "Sega's answer to Mario. Run at high speeds as Sonic through colorful zones while collecting rings.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/b/ba/Sonic_the_Hedgehog_1_Genesis_box_art.jpg",
    rating: 8.9
  },
  {
    name: "Mega Man 2",
    genre: "Action",
    platforms: ["NES"],
    releaseDate: new Date("1988-12-24"),
    multiplayer: false,
    description: "The blue bomber's most beloved adventure. Defeat 8 robot masters and take their powers.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/5/53/Mega_Man_2_cover.jpg",
    rating: 9.1
  },
  {
    name: "Castlevania",
    genre: "Action",
    platforms: ["NES"],
    releaseDate: new Date("1986-09-26"),
    multiplayer: false,
    description: "Venture into Dracula's castle as Simon Belmont armed with the legendary Vampire Killer whip.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/8/8a/Castlevania_cover_art.jpg",
    rating: 8.7
  },
  {
    name: "Contra",
    genre: "Shooter",
    platforms: ["NES", "Arcade"],
    releaseDate: new Date("1987-02-20"),
    multiplayer: true,
    description: "Run and gun action at its finest. Battle alien forces with a friend in this cooperative shooter.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/8/8a/Contra_cover_art.jpg",
    rating: 8.6
  },
  {
    name: "Final Fantasy",
    genre: "RPG",
    platforms: ["NES"],
    releaseDate: new Date("1987-12-18"),
    multiplayer: false,
    description: "The beginning of the legendary RPG series. Four warriors of light must restore the crystals and save the world.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/7/7d/Final_Fantasy_1_JP_Box.jpg",
    rating: 8.4
  }
]);

print("MongoDB initialization completed successfully!"); 