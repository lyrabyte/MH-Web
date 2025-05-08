import { Director } from './Director.js';
import { RandomDirection } from './RandomDirection.js';
import { Wait } from './Wait.js';
import { EmptyBlock } from './EmptyBlock.js';
import { Increase } from './Increase.js'; 
import { Decrease } from './Decrease.js';
import { Next } from './Next.js';
import { Previous } from './Previous.js'; 
import { Pop } from './Pop.js'; 
import { Wire } from './Wire.js'; 
import { JumpTo } from './JumpTo.js'; 
import { Checkpoint } from './Checkpoint.js';
import { ReturnCheckpoint } from './returnCheckpoint.js';
export const AllBlockClasses = [
    Director,
    RandomDirection,
    JumpTo,
    Wait,
    Increase, 
    Decrease,
    Next,
    Previous, 
    Pop,
    Checkpoint,
    ReturnCheckpoint,
    Wire,
    EmptyBlock,
];

console.log("allBlocks.js loaded, exporting:", AllBlockClasses.map(cls => cls?.name || 'Unknown Class'));