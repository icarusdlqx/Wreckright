import { gadflyIronworkPlan, prybarIronworkPlan } from './plans-ironwork-light';
import { falchionMonolithPlan, sentinelMonolithPlan } from './plans-monolith-medium';
import { rivetIronworkPlan, trestleIronworkPlan } from './plans-ironwork-medium';
import { bulwarkIronworkPlan, cairnIronworkPlan } from './plans-ironwork-heavy';
import { colossusIronworkPlan, rampartIronworkPlan } from './plans-ironwork-assault';
import { vesperMonolithPlan, votiveMonolithPlan } from './plans-monolith-light';
import { halberdMonolithPlan, wardenMonolithPlan } from './plans-monolith-heavy';
import { obsequyMonolithPlan, pallvaultMonolithPlan } from './plans-monolith-assault';
import type { Plan } from './types';

/** Walker identity owns primary construction; vehicles retain their original plans. */
export const WALKER_PLANS: Readonly<Record<string, Plan>> = {
  hornet_hnt2: gadflyIronworkPlan,
  prybar_pry1: prybarIronworkPlan,
  rivet_rvt1: rivetIronworkPlan,
  trestle_trs1: trestleIronworkPlan,
  cairn_crn3: cairnIronworkPlan,
  bulwark_bwk3: bulwarkIronworkPlan,
  rampart_rmp4: rampartIronworkPlan,
  colossus_cls1: colossusIronworkPlan,
  wisp_wsp1: vesperMonolithPlan,
  votive_vtv2: votiveMonolithPlan,
  sentinel_snl2: sentinelMonolithPlan,
  falchion_fal2: falchionMonolithPlan,
  warden_wrd5: wardenMonolithPlan,
  halberd_hlb4: halberdMonolithPlan,
  obsequy_obq3: obsequyMonolithPlan,
  pallvault_plv1: pallvaultMonolithPlan,
};
