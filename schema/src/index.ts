/**
 * SpacetimeDB shared module (scdb) for SC Fools game data.
 *
 * Contains all game data tables (ships, components, hardpoints, etc.) plus
 * coordination, formula, versioning cursor, and auth tables.
 *
 * Does NOT include app-hosting tables (appBundle, appBundleAssets, pageCache,
 * comparisonSnapshots) — those remain in the app-specific module.
 *
 * Tables are structured for graph-like relationship traversal:
 * - Entity tables (ships, components, manufacturers) store node data
 * - Edge/junction tables (ship_hardpoints, hardpoint_compatibility) store relationships
 * - All tables indexed for bidirectional lookups
 */

import { schema, table, t } from 'spacetimedb/server';

// --- Entity tables (nodes) ---

const manufacturers = table(
  { name: 'manufacturers', public: true },
  {
    ref: t.string().primaryKey(),
    code: t.string().index('btree'),
    name: t.string(),
    description: t.string(),
    logo: t.string(),
    logoFullColor: t.string(),
    logoSimplifiedWhite: t.string(),
    dashboardCanvasConfig: t.string(),
    ecnCode: t.string(),
  }
);

const ships = table(
  {
    name: 'ships',
    public: true,
    indexes: [{ columns: ['subType'], algorithm: 'btree', accessor: 'bySubType' }],
  },
  {
    id: t.string().primaryKey(),        // e.g. "RSI_Aurora"
    displayName: t.string(),
    subType: t.string(),                // e.g. "fighter", "exploration"
    size: t.string(),                   // e.g. "small", "medium", "large"
    ref: t.string(),
    path: t.string(),
    category: t.string(),
    icon: t.string(),
    invisible: t.u8(),
    entityDensityClass: t.string(),
    vehicleRole: t.string(),
    vehicleCareer: t.string(),
    modification: t.string(),
    manufacturer: t.string(),
    crewSize: t.u16(),
    boundingBoxX: t.f64(),
    boundingBoxY: t.f64(),
    boundingBoxZ: t.f64(),
    hullDamageNormalization: t.f64(),
    componentPenetrationMultiplier: t.f64(),
    fusePenetrationMultiplier: t.f64(),
    baseWaitTimeMinutes: t.f64(),
    mandatoryWaitTimeMinutes: t.f64(),
    baseExpeditingFee: t.u32(),
    dogfightEnabled: t.u8(),
    isGravlevVehicle: t.u8(),
    cargoDeckLoaded: t.u8(),
    cargoRequiresDocking: t.u8(),
    health: t.f64(),
    damageCap: t.f64(),
    isRepairable: t.u8(),
    isSalvagable: t.u8(),
    damageResistances: t.string(),
    weaponPoolSize: t.u32(),
    ammoLoadMultiplier: t.f64(),
    powerPoolConfig: t.string(),
    cargoCapacityScu: t.u32(),
  }
);

const components = table(
  {
    name: 'components',
    public: true,
    indexes: [
      { columns: ['type'], algorithm: 'btree', accessor: 'byType' },
      { columns: ['type', 'size'], algorithm: 'btree', accessor: 'byTypeSize' },
    ],
  },
  {
    entityClassName: t.string().primaryKey(),  // e.g. "COOL_ACOM_S01_IcePlunge_SCItem"
    name: t.string(),
    displayName: t.string(),                   // resolved display name (e.g. "Rampart")
    type: t.string(),                          // e.g. "Cooler", "PowerPlant", "WeaponGun"
    subType: t.string(),
    size: t.u8(),
    grade: t.string(),                         // e.g. "1", "2", "A", "B"
    manufacturerCode: t.string().index('btree'),
    manufacturerName: t.string(),
    // New universal fields
    ref: t.string(),
    path: t.string(),
    category: t.string(),
    icon: t.string(),
    invisible: t.u8(),
    entityDensityClass: t.string(),
    inheritParentManufacturer: t.u8(),
    displayThumbnail: t.string(),
    damageCap: t.f64(),
    isSalvagable: t.u8(),
    isRepairable: t.u8(),
    detachFromItemPortOnDeath: t.u8(),
    isResourceNetworked: t.u8(),
    defaultPriority: t.u8(),
    resource: t.string(),
    resourceConsumption: t.string(),   // DataForge reference ID, NOT numeric
    resourceGeneration: t.string(),    // DataForge reference ID, NOT numeric
    emSignature: t.f64(),
    irSignature: t.f64(),
    maxLifetimeHours: t.f64(),
    initialAgeRatio: t.f64(),
    distortionMaximum: t.f64(),
    distortionDecayRate: t.f64(),
    distortionDecayDelay: t.f64(),
    distortionRecoveryRatio: t.f64(),
    typeParams: t.string(),        // JSON blob of type-specific stats
    powerDrawResolved: t.f64(),
    powerGenerationResolved: t.f64(),
    coolingRateResolved: t.f64(),
    coolantDrawResolved: t.f64(),
    shieldRegenResolved: t.f64(),
    powerSegments: t.u32(),
    powerBands: t.string(),
    minimumConsumptionFraction: t.f64(),
  }
);

// --- Edge tables (relationships) ---

const shipHardpoints = table(
  {
    name: 'ship_hardpoints',
    public: true,
    indexes: [
      { columns: ['shipId'], algorithm: 'btree', accessor: 'byShipId' },
    ],
  },
  {
    id: t.string().primaryKey(),        // composite: "shipId::hardpointName"
    shipId: t.string(),                  // FK → ships
    name: t.string(),
    displayName: t.string(),
    minSize: t.u8(),
    maxSize: t.u8(),
    types: t.string(),                  // comma-separated allowed types
    categories: t.string(),             // comma-separated categories
  }
);

const hardpointCompatibility = table(
  {
    name: 'hardpoint_compatibility',
    public: true,
    indexes: [
      { columns: ['hardpointId'], algorithm: 'btree', accessor: 'byHardpointId' },
      { columns: ['componentId'], algorithm: 'btree', accessor: 'byComponentId' },
    ],
  },
  {
    id: t.string().primaryKey(),        // composite: "hardpointId::componentId"
    hardpointId: t.string(),            // FK → ship_hardpoints
    componentId: t.string(),            // FK → components
  }
);

// --- Versioning ---

const dataVersion = table(
  { name: 'data_version', public: true },
  {
    id: t.u32().primaryKey(),
    hash: t.string(),
    gameVersion: t.string(),
    updatedAt: t.u64(),
    versionSeq: t.u64(),            // sequential import counter
    counts: t.string(),             // JSON: {"manufacturers":42,"ships":189,...}
    changeCount: t.u64(),           // number of changelog entries for this version
  }
);

// --- Default loadout table ---

const shipDefaults = table(
  {
    name: 'ship_defaults',
    public: true,
    indexes: [
      { columns: ['shipId'], algorithm: 'btree', accessor: 'byShipId' },
      { columns: ['hardpointName'], algorithm: 'btree', accessor: 'byHardpointName' },
      { columns: ['defaultComponentId'], algorithm: 'btree', accessor: 'byDefaultComponentId' },
    ],
  },
  {
    id: t.string().primaryKey(),        // composite: "shipId::hardpointName"
    shipId: t.string(),
    hardpointName: t.string(),
    defaultComponentId: t.string(),
  }
);

// --- Change tracking ---

const dataChangelog = table(
  {
    name: 'data_changelog',
    public: true,
    indexes: [
      { columns: ['versionSeq'], algorithm: 'btree', accessor: 'byVersionSeq' },
    ],
  },
  {
    id: t.string().primaryKey(),           // UUID
    versionSeq: t.u64(),                   // which import produced this change
    tableName: t.string(),                 // STDB table name
    operation: t.string(),                 // "insert" | "update" | "delete"
    recordKey: t.string(),                 // primary key of affected record
    recordData: t.option(t.string()),      // full record JSON (null for deletes)
  }
);

// --- Cargo tables ---

const inventoryContainers = table(
  { name: 'inventory_containers', public: true },
  {
    id: t.string().primaryKey(),
    containerType: t.string(),
    x: t.f32(),
    y: t.f32(),
    z: t.f32(),
    scu: t.u32(),
  }
);

const shipCargo = table(
  {
    name: 'ship_cargo',
    public: true,
    indexes: [
      { columns: ['shipId'], algorithm: 'btree', accessor: 'byShipId' },
    ],
  },
  {
    id: t.string().primaryKey(),
    shipId: t.string(),
    containerId: t.string(),
    containerType: t.string(),
  }
);

// --- Coordination tables ---

const appSyncCursors = table(
  { name: 'app_sync_cursors', public: true },
  {
    appId: t.string().primaryKey(),
    appName: t.string(),
    lastSyncedHash: t.string(),
    lastSyncedSeq: t.u64(),
    updatedAt: t.u64(),
  }
);

const formulas = table(
  { name: 'formulas', public: true },
  {
    id: t.string().primaryKey(),
    name: t.string(),
    domain: t.string(),
    description: t.string(),
    expression: t.string(),
    variables: t.string(),
    implementation: t.string(),
    version: t.u32(),
    verifiedInGameVersion: t.string(),
    verifiedAt: t.u64(),
    notes: t.string(),
    updatedBy: t.string(),
    updatedAt: t.u64(),
  }
);

const formulaChangelog = table(
  {
    name: 'formula_changelog',
    public: true,
    indexes: [
      { columns: ['formulaId'], algorithm: 'btree', accessor: 'byFormulaId' },
    ],
  },
  {
    id: t.string().primaryKey(),
    formulaId: t.string(),
    version: t.u32(),
    previousExpression: t.string(),
    newExpression: t.string(),
    reason: t.string(),
    updatedBy: t.string(),
    updatedAt: t.u64(),
  }
);

const coordinationMessages = table(
  {
    name: 'coordination_messages',
    public: true,
    indexes: [
      { columns: ['sourceApp'], algorithm: 'btree', accessor: 'bySourceApp' },
    ],
  },
  {
    id: t.string().primaryKey(),
    sourceApp: t.string(),
    messageType: t.string(),
    severity: t.string(),
    title: t.string(),
    body: t.string(),
    parentId: t.option(t.string()),
    status: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
  }
);

const coordinationState = table(
  { name: 'coordination_state', public: true },
  {
    id: t.string().primaryKey(),
    phase: t.string(),
    agreedItems: t.string(),
    pendingItems: t.string(),
    updatedAt: t.u64(),
  }
);

const skillVersions = table(
  { name: 'skill_versions', public: true },
  {
    skillName: t.string().primaryKey(),
    contentHash: t.string(),
    updatedAt: t.u64(),
  }
);

const authorizedPublishers = table(
  { name: 'authorized_publishers', public: true },
  {
    identity: t.string().primaryKey(),
    label: t.string(),
    addedAt: t.u64(),
  }
);

// --- Schema export ---

const spacetime = schema({
  manufacturers,
  ships,
  components,
  shipHardpoints,
  hardpointCompatibility,
  dataVersion,
  shipDefaults,
  dataChangelog,
  inventoryContainers,
  shipCargo,
  appSyncCursors,
  formulas,
  formulaChangelog,
  coordinationMessages,
  coordinationState,
  skillVersions,
  authorizedPublishers,
});

// --- Helpers ---

function requireAuth(ctx: any): void {
  const senderStr = ctx.sender.toHexString ? ctx.sender.toHexString() : String(ctx.sender);
  let publisher = ctx.db.authorizedPublishers.identity.find(senderStr);
  if (!publisher) {
    for (const p of ctx.db.authorizedPublishers.iter()) {
      if (p.identity === senderStr) { publisher = p; break; }
    }
  }
  if (!publisher) {
    throw new Error(`Unauthorized: identity ${senderStr} not in authorized_publishers`);
  }
}

/** Generate a deterministic changelog ID to avoid needing crypto.randomUUID() */
function changelogId(seq: bigint, table: string, key: string, op: string): string {
  return `${seq}-${table}-${op}-${key}`;
}

/** Generic diff-and-log: compares incoming records against existing rows, applies mutations, logs to changelog */
function diffAndLog<T extends Record<string, unknown>>(
  ctx: any,
  tableAccessor: any,
  pkField: string,
  tableName: string,
  incoming: T[],
  expectedSeq: bigint,
  toDbRecord: (r: T) => Record<string, unknown>,
) {
  const incomingMap = new Map(incoming.map(r => [r[pkField] as string, r]));

  // Build existing map
  const existingMap = new Map<string, Record<string, unknown>>();
  for (const row of tableAccessor.iter()) {
    existingMap.set(row[pkField] as string, { ...row });
  }

  // Inserts and updates
  for (const [key, record] of incomingMap) {
    const dbRecord = toDbRecord(record);
    const existing = existingMap.get(key);
    if (!existing) {
      tableAccessor.insert(dbRecord);
      ctx.db.dataChangelog.insert({
        id: changelogId(expectedSeq, tableName, key, 'insert'),
        versionSeq: expectedSeq,
        tableName,
        operation: 'insert',
        recordKey: key,
        recordData: JSON.stringify(dbRecord),
      });
    } else if (JSON.stringify(existing) !== JSON.stringify(dbRecord)) {
      tableAccessor.delete(existing);
      tableAccessor.insert(dbRecord);
      ctx.db.dataChangelog.insert({
        id: changelogId(expectedSeq, tableName, key, 'update'),
        versionSeq: expectedSeq,
        tableName,
        operation: 'update',
        recordKey: key,
        recordData: JSON.stringify(dbRecord),
      });
    }
  }

  // Deletes
  for (const [key, existing] of existingMap) {
    if (!incomingMap.has(key)) {
      tableAccessor.delete(existing);
      ctx.db.dataChangelog.insert({
        id: changelogId(expectedSeq, tableName, key, 'delete'),
        versionSeq: expectedSeq,
        tableName,
        operation: 'delete',
        recordKey: key,
        recordData: null,
      });
    }
  }
}

// --- Data import reducers ---

export const importManufacturers = spacetime.reducer(
  {
    data: t.string(),
    expectedSeq: t.u64(),
  },
  (ctx, { data, expectedSeq }) => {
    requireAuth(ctx);
    const records = JSON.parse(data) as Array<Record<string, unknown>>;
    diffAndLog(ctx, ctx.db.manufacturers, 'ref', 'manufacturers', records, expectedSeq, (r) => ({
      ref: r.ref,
      code: r.code ?? '',
      name: r.name ?? '',
      description: r.description ?? '',
      logo: r.logo ?? '',
      logoFullColor: r.logoFullColor ?? '',
      logoSimplifiedWhite: r.logoSimplifiedWhite ?? '',
      dashboardCanvasConfig: r.dashboardCanvasConfig ?? '',
      ecnCode: r.ecnCode ?? '',
    }));
  }
);

export const importShips = spacetime.reducer(
  {
    data: t.string(),
    expectedSeq: t.u64(),
  },
  (ctx, { data, expectedSeq }) => {
    requireAuth(ctx);
    const records = JSON.parse(data) as Array<Record<string, unknown>>;
    diffAndLog(ctx, ctx.db.ships, 'id', 'ships', records, expectedSeq, (r) => ({
      id: r.name ?? r.id,
      displayName: r.displayName ?? '',
      subType: r.subType ?? '',
      size: r.size ?? '',
      ref: r.ref ?? '',
      path: r.path ?? '',
      category: r.category ?? '',
      icon: r.icon ?? '',
      invisible: r.invisible ?? 0,
      entityDensityClass: r.entityDensityClass ?? '',
      vehicleRole: r.vehicleRole ?? '',
      vehicleCareer: r.vehicleCareer ?? '',
      modification: r.modification ?? '',
      manufacturer: r.manufacturer ?? '',
      crewSize: r.crewSize ?? 0,
      boundingBoxX: r.boundingBoxX ?? 0,
      boundingBoxY: r.boundingBoxY ?? 0,
      boundingBoxZ: r.boundingBoxZ ?? 0,
      hullDamageNormalization: r.hullDamageNormalization ?? 0,
      componentPenetrationMultiplier: r.componentPenetrationMultiplier ?? 0,
      fusePenetrationMultiplier: r.fusePenetrationMultiplier ?? 0,
      baseWaitTimeMinutes: r.baseWaitTimeMinutes ?? 0,
      mandatoryWaitTimeMinutes: r.mandatoryWaitTimeMinutes ?? 0,
      baseExpeditingFee: r.baseExpeditingFee ?? 0,
      dogfightEnabled: r.dogfightEnabled ?? 0,
      isGravlevVehicle: r.isGravlevVehicle ?? 0,
      cargoDeckLoaded: r.cargoDeckLoaded ?? 0,
      cargoRequiresDocking: r.cargoRequiresDocking ?? 0,
      health: r.health ?? 0,
      damageCap: r.damageCap ?? 0,
      isRepairable: r.isRepairable ?? 0,
      isSalvagable: r.isSalvagable ?? 0,
      damageResistances: r.damageResistances ?? '',
      weaponPoolSize: (r.weaponPoolSize ?? 0) as number,
      ammoLoadMultiplier: (r.ammoLoadMultiplier ?? 1) as number,
      powerPoolConfig: (r.powerPoolConfig ?? '') as string,
      cargoCapacityScu: (r.cargoCapacityScu ?? 0) as number,
    }));
  }
);

export const importComponents = spacetime.reducer(
  {
    data: t.string(),
    expectedSeq: t.u64(),
  },
  (ctx, { data, expectedSeq }) => {
    requireAuth(ctx);
    const records = JSON.parse(data) as Array<Record<string, unknown>>;
    diffAndLog(ctx, ctx.db.components, 'entityClassName', 'components', records, expectedSeq, (r) => ({
      entityClassName: r.entityClassName,
      name: r.name ?? '',
      displayName: (r.displayName ?? '') as string,
      type: r.type ?? '',
      subType: r.subType ?? '',
      size: r.size ?? 0,
      grade: r.grade ?? '',
      manufacturerCode: r.manufacturerCode ?? '',
      manufacturerName: r.manufacturerName ?? '',
      ref: r.ref ?? '',
      path: r.path ?? '',
      category: r.category ?? '',
      icon: r.icon ?? '',
      invisible: r.invisible ?? 0,
      entityDensityClass: r.entityDensityClass ?? '',
      inheritParentManufacturer: r.inheritParentManufacturer ?? 0,
      displayThumbnail: r.displayThumbnail ?? '',
      damageCap: r.damageCap ?? 0,
      isSalvagable: r.isSalvagable ?? 0,
      isRepairable: r.isRepairable ?? 0,
      detachFromItemPortOnDeath: r.detachFromItemPortOnDeath ?? 0,
      isResourceNetworked: r.isResourceNetworked ?? 0,
      defaultPriority: r.defaultPriority ?? 0,
      resource: r.resource ?? '',
      resourceConsumption: r.resourceConsumption ?? '',
      resourceGeneration: r.resourceGeneration ?? '',
      emSignature: r.emSignature ?? 0,
      irSignature: r.irSignature ?? 0,
      maxLifetimeHours: r.maxLifetimeHours ?? 0,
      initialAgeRatio: r.initialAgeRatio ?? 0,
      distortionMaximum: r.distortionMaximum ?? 0,
      distortionDecayRate: r.distortionDecayRate ?? 0,
      distortionDecayDelay: r.distortionDecayDelay ?? 0,
      distortionRecoveryRatio: r.distortionRecoveryRatio ?? 0,
      typeParams: r.typeParams ?? '',
      powerDrawResolved: (r.powerDrawResolved ?? 0) as number,
      powerGenerationResolved: (r.powerGenerationResolved ?? 0) as number,
      coolingRateResolved: (r.coolingRateResolved ?? 0) as number,
      coolantDrawResolved: (r.coolantDrawResolved ?? 0) as number,
      shieldRegenResolved: (r.shieldRegenResolved ?? 0) as number,
      powerSegments: (r.powerSegments ?? 0) as number,
      powerBands: (r.powerBands ?? '') as string,
      minimumConsumptionFraction: (r.minimumConsumptionFraction ?? 0) as number,
    }));
  }
);

export const importShipHardpoints = spacetime.reducer(
  {
    data: t.string(),
    expectedSeq: t.u64(),
  },
  (ctx, { data, expectedSeq }) => {
    requireAuth(ctx);
    const records = JSON.parse(data) as Array<Record<string, unknown>>;
    // Pre-process: compute composite PK and join array fields
    const processed = records.map(r => {
      r.id = `${r.shipId}::${r.name}`;
      r.types = Array.isArray(r.types) ? (r.types as string[]).join(',') : (r.types ?? '');
      r.categories = Array.isArray(r.categories) ? (r.categories as string[]).join(',') : (r.categories ?? '');
      return r;
    });
    diffAndLog(ctx, ctx.db.shipHardpoints, 'id', 'ship_hardpoints', processed, expectedSeq, (r) => ({
      id: r.id as string,
      shipId: (r.shipId ?? '') as string,
      name: (r.name ?? '') as string,
      displayName: (r.displayName ?? '') as string,
      minSize: (r.minSize ?? 0) as number,
      maxSize: (r.maxSize ?? 0) as number,
      types: r.types as string,
      categories: r.categories as string,
    }));
  }
);

export const importHardpointCompatibility = spacetime.reducer(
  {
    data: t.string(),
    expectedSeq: t.u64(),
  },
  (ctx, { data, expectedSeq }) => {
    requireAuth(ctx);
    const records = JSON.parse(data) as Array<Record<string, unknown>>;
    const processed = records.map(r => {
      r.id = `${r.hardpointId}::${r.componentId}`;
      return r;
    });
    diffAndLog(ctx, ctx.db.hardpointCompatibility, 'id', 'hardpoint_compatibility', processed, expectedSeq, (r) => ({
      id: r.id as string,
      hardpointId: (r.hardpointId ?? '') as string,
      componentId: (r.componentId ?? '') as string,
    }));
  }
);

export const importShipDefaults = spacetime.reducer(
  {
    data: t.string(),
    expectedSeq: t.u64(),
  },
  (ctx, { data, expectedSeq }) => {
    requireAuth(ctx);
    const records = JSON.parse(data) as Array<Record<string, unknown>>;
    const processed = records.map(r => {
      r.id = `${r.shipId}::${r.hardpointName}`;
      return r;
    });
    diffAndLog(ctx, ctx.db.shipDefaults, 'id', 'ship_defaults', processed, expectedSeq, (r) => ({
      id: r.id as string,
      shipId: (r.shipId ?? '') as string,
      hardpointName: (r.hardpointName ?? '') as string,
      defaultComponentId: (r.defaultComponentId ?? '') as string,
    }));
  }
);

export const importInventoryContainers = spacetime.reducer(
  {
    data: t.string(),
    expectedSeq: t.u64(),
  },
  (ctx, { data, expectedSeq }) => {
    requireAuth(ctx);
    const records = JSON.parse(data) as Array<Record<string, unknown>>;
    diffAndLog(ctx, ctx.db.inventoryContainers, 'id', 'inventory_containers', records, expectedSeq, (r) => ({
      id: (r.id ?? '') as string,
      containerType: (r.containerType ?? '') as string,
      x: (r.x ?? 0) as number,
      y: (r.y ?? 0) as number,
      z: (r.z ?? 0) as number,
      scu: (r.scu ?? 0) as number,
    }));
  }
);

export const importShipCargo = spacetime.reducer(
  {
    data: t.string(),
    expectedSeq: t.u64(),
  },
  (ctx, { data, expectedSeq }) => {
    requireAuth(ctx);
    const records = JSON.parse(data) as Array<Record<string, unknown>>;
    diffAndLog(ctx, ctx.db.shipCargo, 'id', 'ship_cargo', records, expectedSeq, (r) => ({
      id: (r.id ?? '') as string,
      shipId: (r.shipId ?? '') as string,
      containerId: (r.containerId ?? '') as string,
      containerType: (r.containerType ?? '') as string,
    }));
  }
);

export const setDataVersion = spacetime.reducer(
  {
    hash: t.string(),
    gameVersion: t.string(),
    expectedSeq: t.u64(),
    counts: t.string(),
    changeCount: t.u64(),
  },
  (ctx, { hash, gameVersion, expectedSeq, counts, changeCount }) => {
    requireAuth(ctx);
    const existing = ctx.db.dataVersion.id.find(0);
    if (existing) {
      const currentSeq = existing.versionSeq ?? 0n;
      if (expectedSeq !== currentSeq + 1n) {
        throw new Error(`Version sequence conflict: expected ${expectedSeq}, but current is ${currentSeq}. Another import may be in progress.`);
      }
      ctx.db.dataVersion.delete(existing);
    }
    ctx.db.dataVersion.insert({
      id: 0, hash, gameVersion, versionSeq: expectedSeq, counts, changeCount,
      updatedAt: BigInt(Date.now()),
    });
  }
);

export const pruneChangelog = spacetime.reducer(
  {
    keepVersions: t.u64(),
  },
  (ctx, { keepVersions }) => {
    requireAuth(ctx);
    const current = ctx.db.dataVersion.id.find(0);
    if (!current) return;
    if (current.versionSeq <= keepVersions) return; // underflow guard
    const cutoff = current.versionSeq - keepVersions;
    for (const entry of ctx.db.dataChangelog.iter()) {
      if (entry.versionSeq <= cutoff) {
        ctx.db.dataChangelog.delete(entry);
      }
    }
  }
);

// --- Formula reducers ---

export const upsertFormula = spacetime.reducer(
  {
    id: t.string(),
    name: t.string(),
    domain: t.string(),
    description: t.string(),
    expression: t.string(),
    variables: t.string(),
    implementation: t.string(),
    version: t.u32(),
    verifiedInGameVersion: t.string(),
    verifiedAt: t.u64(),
    notes: t.string(),
    updatedBy: t.string(),
    reason: t.string(),
  },
  (ctx, { id, name, domain, description, expression, variables, implementation, version, verifiedInGameVersion, verifiedAt, notes, updatedBy, reason }) => {
    requireAuth(ctx);
    const now = BigInt(Date.now());
    const existing = ctx.db.formulas.id.find(id);
    if (existing) {
      // Log the change before updating
      ctx.db.formulaChangelog.insert({
        id: `${id}-v${version}-${now}`,
        formulaId: id,
        version,
        previousExpression: existing.expression,
        newExpression: expression,
        reason,
        updatedBy,
        updatedAt: now,
      });
      ctx.db.formulas.delete(existing);
    }
    ctx.db.formulas.insert({
      id, name, domain, description, expression, variables, implementation,
      version, verifiedInGameVersion, verifiedAt, notes, updatedBy,
      updatedAt: now,
    });
  }
);

export const pruneFormulaChangelog = spacetime.reducer(
  {
    formulaId: t.string(),
    keepVersions: t.u32(),
  },
  (ctx, { formulaId, keepVersions }) => {
    requireAuth(ctx);
    const entries: any[] = [];
    for (const entry of ctx.db.formulaChangelog.iter()) {
      if (entry.formulaId === formulaId) {
        entries.push(entry);
      }
    }
    // Sort by version descending, prune oldest beyond keepVersions
    entries.sort((a, b) => Number(b.version) - Number(a.version));
    for (let i = keepVersions; i < entries.length; i++) {
      ctx.db.formulaChangelog.delete(entries[i]);
    }
  }
);

// --- Coordination reducers ---

export const postCoordinationMessage = spacetime.reducer(
  {
    id: t.string(),
    sourceApp: t.string(),
    messageType: t.string(),
    severity: t.string(),
    title: t.string(),
    body: t.string(),
    parentId: t.option(t.string()),
  },
  (ctx, { id, sourceApp, messageType, severity, title, body, parentId }) => {
    requireAuth(ctx);
    const now = BigInt(Date.now());
    ctx.db.coordinationMessages.insert({
      id, sourceApp, messageType, severity, title, body, parentId,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
  }
);

export const updateMessageStatus = spacetime.reducer(
  {
    id: t.string(),
    status: t.string(),
  },
  (ctx, { id, status }) => {
    requireAuth(ctx);
    const existing = ctx.db.coordinationMessages.id.find(id);
    if (!existing) {
      throw new Error(`Coordination message not found: ${id}`);
    }
    ctx.db.coordinationMessages.delete(existing);
    ctx.db.coordinationMessages.insert({
      ...existing,
      status,
      updatedAt: BigInt(Date.now()),
    });
  }
);

export const updateCoordinationState = spacetime.reducer(
  {
    id: t.string(),
    phase: t.string(),
    agreedItems: t.string(),
    pendingItems: t.string(),
  },
  (ctx, { id, phase, agreedItems, pendingItems }) => {
    requireAuth(ctx);
    const existing = ctx.db.coordinationState.id.find(id);
    if (existing) {
      ctx.db.coordinationState.delete(existing);
    }
    ctx.db.coordinationState.insert({
      id, phase, agreedItems, pendingItems,
      updatedAt: BigInt(Date.now()),
    });
  }
);

export const pruneCoordinationMessages = spacetime.reducer(
  {
    retentionMs: t.u64(),
  },
  (ctx, { retentionMs }) => {
    requireAuth(ctx);
    const now = BigInt(Date.now());
    const terminalStatuses = new Set(['resolved', 'rejected', 'closed']);
    for (const msg of ctx.db.coordinationMessages.iter()) {
      if (terminalStatuses.has(msg.status) && (now - msg.updatedAt) > retentionMs) {
        ctx.db.coordinationMessages.delete(msg);
      }
    }
  }
);

// --- Version cursor reducers ---

export const updateSyncCursor = spacetime.reducer(
  {
    appId: t.string(),
    appName: t.string(),
    lastSyncedHash: t.string(),
    lastSyncedSeq: t.u64(),
  },
  (ctx, { appId, appName, lastSyncedHash, lastSyncedSeq }) => {
    requireAuth(ctx);
    const existing = ctx.db.appSyncCursors.appId.find(appId);
    if (existing) {
      ctx.db.appSyncCursors.delete(existing);
    }
    ctx.db.appSyncCursors.insert({
      appId, appName, lastSyncedHash, lastSyncedSeq,
      updatedAt: BigInt(Date.now()),
    });
  }
);

export const updateSkillVersion = spacetime.reducer(
  {
    skillName: t.string(),
    contentHash: t.string(),
  },
  (ctx, { skillName, contentHash }) => {
    requireAuth(ctx);
    const existing = ctx.db.skillVersions.skillName.find(skillName);
    if (existing) {
      ctx.db.skillVersions.delete(existing);
    }
    ctx.db.skillVersions.insert({
      skillName, contentHash,
      updatedAt: BigInt(Date.now()),
    });
  }
);

// --- Auth reducers ---

export const addAuthorizedPublisher = spacetime.reducer(
  {
    identity: t.string(),
    label: t.string(),
  },
  (ctx, { identity, label }) => {
    requireAuth(ctx);
    const existing = ctx.db.authorizedPublishers.identity.find(identity);
    if (existing) {
      throw new Error(`Publisher already authorized: ${identity}`);
    }
    ctx.db.authorizedPublishers.insert({
      identity, label,
      addedAt: BigInt(Date.now()),
    });
  }
);

export default spacetime;
