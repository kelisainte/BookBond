import {z} from 'zod';
import type {Tx} from './db';

const featureFlags=z.strictObject({listingsEnabled:z.boolean(),offersEnabled:z.boolean(),roomPublishingEnabled:z.boolean()});
const discovery=z.strictObject({publicListingsEnabled:z.boolean(),publicRoomsEnabled:z.boolean()});
const serviceNotices=z.strictObject({message:z.string().max(500)});
export const policyDefaults={
  feature_flags:{listingsEnabled:true,offersEnabled:true,roomPublishingEnabled:true},
  discovery:{publicListingsEnabled:true,publicRoomsEnabled:true},
  service_notices:{message:''}
} as const;
export type PolicyKey=keyof typeof policyDefaults;
export function validatePolicy(key:PolicyKey,value:unknown) {
  if(key==='feature_flags')return featureFlags.parse(value);
  if(key==='discovery')return discovery.parse(value);
  return serviceNotices.parse(value);
}
export async function effectivePolicy<K extends PolicyKey>(tx:Tx,key:K):Promise<(typeof policyDefaults)[K]> {
  const {rows}=await tx.query('select value from policies where key=$1',[key]);
  return rows.length?validatePolicy(key,rows[0].value) as (typeof policyDefaults)[K]:policyDefaults[key];
}
