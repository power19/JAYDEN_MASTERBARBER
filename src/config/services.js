/**
 * Barbershop Services
 * Edit this file to add, remove or change services, prices and durations.
 *
 * duration  → appointment length in minutes (affects which time slots show)
 * price     → displayed in the bot (uses CURRENCY from .env)
 */
const SERVICES = [
  {
    id: '1',
    name: 'Haircut',
    emoji: '✂️',
    description: 'Classic or modern cut tailored to your style',
    duration: 30,   // minutes
    price: 35,
  },
  {
    id: '2',
    name: 'Beard Trim',
    emoji: '🪒',
    description: 'Shape and style your beard to perfection',
    duration: 20,
    price: 25,
  },
  {
    id: '3',
    name: 'Haircut + Beard Trim',
    emoji: '✂️🪒',
    description: 'Full grooming package — haircut and beard in one visit',
    duration: 50,
    price: 55,
  },
  {
    id: '4',
    name: "Kid's Haircut",
    emoji: '👦',
    description: 'Haircut for kids under 12',
    duration: 25,
    price: 25,
  },
  {
    id: '5',
    name: 'Hot Towel Shave',
    emoji: '🔥',
    description: 'Traditional straight razor shave with hot towel treatment',
    duration: 40,
    price: 45,
  },
  {
    id: '6',
    name: 'Haircut + Hot Towel Shave',
    emoji: '💈',
    description: 'The ultimate barbershop experience',
    duration: 60,
    price: 75,
  },
];

module.exports = { SERVICES };
