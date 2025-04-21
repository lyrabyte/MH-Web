
import { Director } from './Director.js';
import { RandomDirection } from './RandomDirection.js';
import { Wait } from './Wait.js';

export const AllBlockClasses = [
    Director,
    RandomDirection,
    Wait,
];

console.log("allBlocks.js loaded, exporting:", AllBlockClasses.map(cls => cls?.name || 'Unknown Class'));