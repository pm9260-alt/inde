import { bigDipperMyth } from './big-dipper';
import { cassiopeiaMyth } from './cassiopeia';
import { orionMyth } from './orion';
import { scorpiusMyth } from './scorpius';
import { tanabataMyth } from './tanabata';
import type { Myth } from './types';

export type { Myth, MythScene, MythFocus, MythTradition } from './types';

export const MYTHS: readonly Myth[] = [
  orionMyth,
  scorpiusMyth,
  cassiopeiaMyth,
  bigDipperMyth,
  tanabataMyth,
];

export const mythById = (id: string): Myth => {
  const found = MYTHS.find((m) => m.id === id);
  if (!found) throw new Error(`神話 ${id} は定義されていません`);
  return found;
};
