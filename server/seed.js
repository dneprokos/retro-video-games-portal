const mongoose = require('mongoose');
const Game = require('./models/Game');
require('dotenv').config({ path: __dirname + '/.env' });

const retroGames = [
  {
    name: "Chip 'n Dale Rescue Rangers",
    genre: "Platformer",
    platforms: ["NES"],
    releaseDate: "1990-06-08",
    hasMultiplayer: false,
    description: "A classic platformer featuring Chip and Dale as they rescue their friend Gadget from the evil Fat Cat. Players control either Chip or Dale through various levels, collecting acorns and avoiding enemies.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/8/8a/Chip_%27n_Dale_Rescue_Rangers_NES_cover.jpg",
    rating: 8.5
  },
  {
    name: "Teenage Mutant Ninja Turtles",
    genre: "Action",
    platforms: ["NES"],
    releaseDate: "1989-05-12",
    hasMultiplayer: true,
    description: "The first TMNT game on NES where players control the four turtles through various levels, fighting the Foot Clan and rescuing April O'Neil. Features both single-player and cooperative multiplayer modes.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/5/5a/Teenage_Mutant_Ninja_Turtles_NES_cover.jpg",
    rating: 7.8
  },
  {
    name: "Super Mario Bros.",
    genre: "Platformer",
    platforms: ["NES"],
    releaseDate: "1985-09-13",
    hasMultiplayer: true,
    description: "The iconic platformer that revolutionized gaming. Players control Mario (or Luigi in 2-player mode) to rescue Princess Peach from Bowser. Features innovative level design and power-ups.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/0/03/Super_Mario_Bros._box.png",
    rating: 9.5
  },
  {
    name: "The Legend of Zelda",
    genre: "Adventure",
    platforms: ["NES"],
    releaseDate: "1986-02-21",
    hasMultiplayer: false,
    description: "The first entry in the legendary Zelda series. Players control Link as he explores the land of Hyrule, collecting items and defeating enemies to rescue Princess Zelda from Ganon.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/4/41/Legend_of_zelda_cover_%28with_cartridge%29_gold.png",
    rating: 9.2
  },
  {
    name: "Mega Man 2",
    genre: "Action",
    platforms: ["NES"],
    releaseDate: "1988-12-24",
    hasMultiplayer: false,
    description: "The second installment in the Mega Man series, considered one of the best. Players control Mega Man as he battles through eight robot masters to stop Dr. Wily's evil plans.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/2/27/Mega_Man_2_cover.jpg",
    rating: 9.0
  },
  {
    name: "Contra",
    genre: "Shooter",
    platforms: ["NES"],
    releaseDate: "1987-02-20",
    hasMultiplayer: true,
    description: "A classic run-and-gun shooter where players control commandos fighting against alien forces. Known for its challenging gameplay and the famous 'Konami Code' that gives 30 lives.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/8/8a/Contra_cover.jpg",
    rating: 8.8
  },
  {
    name: "Castlevania",
    genre: "Action",
    platforms: ["NES"],
    releaseDate: "1986-09-26",
    hasMultiplayer: false,
    description: "The first game in the Castlevania series. Players control Simon Belmont as he fights through Dracula's castle using a whip and various weapons to defeat the vampire lord.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/8/8a/Castlevania_cover.jpg",
    rating: 8.7
  },
  {
    name: "Metroid",
    genre: "Adventure",
    platforms: ["NES"],
    releaseDate: "1986-08-06",
    hasMultiplayer: false,
    description: "A groundbreaking action-adventure game featuring Samus Aran. Players explore the planet Zebes, collecting power-ups and fighting space pirates in a non-linear open world.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/8/8a/Metroid_cover.jpg",
    rating: 8.9
  },
  {
    name: "Pac-Man",
    genre: "Arcade",
    platforms: ["Arcade", "NES", "Atari 2600"],
    releaseDate: "1980-05-22",
    hasMultiplayer: false,
    description: "The iconic arcade game where players control Pac-Man, eating dots while avoiding ghosts. One of the most successful video games of all time.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/5/59/Pac-man.png",
    rating: 9.3
  },
  {
    name: "Donkey Kong",
    genre: "Platformer",
    platforms: ["Arcade", "NES"],
    releaseDate: "1981-07-09",
    hasMultiplayer: false,
    description: "The game that introduced Mario (then called Jumpman) to the world. Players control Mario as he climbs ladders and jumps over barrels to rescue Pauline from Donkey Kong.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/4/4d/Donkey_Kong_arcade.png",
    rating: 8.6
  },
  {
    name: "Space Invaders",
    genre: "Shooter",
    platforms: ["Arcade", "Atari 2600"],
    releaseDate: "1978-06-01",
    hasMultiplayer: false,
    description: "The classic arcade shooter that popularized video games. Players control a laser cannon, shooting descending aliens while avoiding their projectiles.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/2/20/SpaceInvaders-Gameplay.jpg",
    rating: 8.4
  },
  {
    name: "Tetris",
    genre: "Puzzle",
    platforms: ["NES", "Game Boy", "Arcade"],
    releaseDate: "1989-06-14",
    hasMultiplayer: false,
    description: "The legendary puzzle game where players arrange falling blocks to create complete lines. One of the best-selling video games of all time.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/7/7d/Tetris_NES_cover_art.jpg",
    rating: 9.1
  },
  {
    name: "Street Fighter II",
    genre: "Fighting",
    platforms: ["Arcade", "SNES"],
    releaseDate: "1991-02-06",
    hasMultiplayer: true,
    description: "The revolutionary fighting game that defined the genre. Players choose from eight characters to battle in one-on-one combat with special moves and combos.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/1/1f/Street_Fighter_II_arcade.png",
    rating: 9.4
  },
  {
    name: "Sonic the Hedgehog",
    genre: "Platformer",
    platforms: ["Sega Genesis"],
    releaseDate: "1991-06-23",
    hasMultiplayer: false,
    description: "The game that introduced Sonic to the world. Players control the blue hedgehog as he runs through levels at high speed, collecting rings and defeating Dr. Robotnik.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/b/ba/Sonic_the_Hedgehog_1_Genesis_box_art.jpg",
    rating: 8.9
  },
  {
    name: "Final Fantasy",
    genre: "RPG",
    platforms: ["NES"],
    releaseDate: "1987-12-18",
    hasMultiplayer: false,
    description: "The first game in the legendary Final Fantasy series. Players control four Light Warriors as they embark on a quest to restore the four elemental crystals and save the world.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/7/7d/Final_Fantasy_NES_cover.jpg",
    rating: 8.7
  },
  {
    name: "Duck Hunt",
    genre: "Shooter",
    platforms: ["NES"],
    releaseDate: "1984-04-21",
    hasMultiplayer: true,
    description: "A light gun shooter where players use the NES Zapper to shoot ducks flying across the screen. Features both single-player and two-player modes.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/8/8a/Duck_Hunt.jpg",
    rating: 7.5
  },
  {
    name: "Excitebike",
    genre: "Racing",
    platforms: ["NES"],
    releaseDate: "1984-11-30",
    hasMultiplayer: false,
    description: "A motorcycle racing game where players navigate through obstacle-filled tracks. Features a track editor allowing players to create custom courses.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/8/8a/Excitebike.jpg",
    rating: 8.2
  },
  {
    name: "Galaga",
    genre: "Shooter",
    platforms: ["Arcade", "NES"],
    releaseDate: "1981-07-01",
    hasMultiplayer: false,
    description: "A classic space shooter where players control a spaceship fighting against waves of alien insects. Known for its challenging gameplay and bonus stages.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/8/8a/Galaga.jpg",
    rating: 8.5
  },
  {
    name: "Dig Dug",
    genre: "Action",
    platforms: ["Arcade", "NES"],
    releaseDate: "1982-04-19",
    hasMultiplayer: false,
    description: "A unique action game where players control a character who digs underground tunnels to defeat enemies by inflating them or dropping rocks on them.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/8/8a/Dig_Dug.jpg",
    rating: 8.3
  },
  {
    name: "Bubble Bobble",
    genre: "Puzzle",
    platforms: ["Arcade", "NES"],
    releaseDate: "1986-10-16",
    hasMultiplayer: true,
    description: "A cooperative puzzle-platformer where players control dinosaurs who trap enemies in bubbles and pop them. Features 100 levels and multiple endings.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/en/8/8a/Bubble_Bobble.jpg",
    rating: 8.6
  }
];

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing users only
    const User = require('./models/User');
    await User.deleteMany({});
    console.log('🗑️  Cleared existing users');

    // Insert games (only if no games exist)
    const existingGames = await Game.countDocuments();
    if (existingGames === 0) {
      await Game.insertMany(retroGames);
      console.log(`🎮 Added ${retroGames.length} retro games to the database`);
    } else {
      console.log(`🎮 Games already exist (${existingGames} games), skipping insertion`);
    }

    // Display some statistics
    const totalGames = await Game.countDocuments();
    console.log(`📊 Total games in database: ${totalGames}`);

    const gamesByGenre = await Game.aggregate([
      { $group: { _id: '$genre', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\n📈 Games by genre:');
    gamesByGenre.forEach(genre => {
      console.log(`  ${genre._id}: ${genre.count} games`);
    });

    console.log('\n🎉 Database seeding completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

// Run the seeder
seedDatabase(); 