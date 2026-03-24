import {
  useRef,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
} from 'react-native';

import { GameState } from '@engine/types';
import {
  LOCATIONS,
  REGIONS,
  getLocation,
  getRegion,
  Location,
  RegionDefinition,
  SHOP_LOCATION_IDS,
  BOSS_LOCATION_IDS,
} from '@data/locations';

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface Props {
  gameState: GameState;
  onToast:   (msg: string) => void;
}

// ─────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────

const NODE_SIZE        = 28;
const NODE_SIZE_CURR   = 36;
const CONNECTOR_WIDTH  = 14;
const ROW_HEIGHT       = 60;   // height of one region row
const REGION_LABEL_W   = 86;   // left label column width

// ─────────────────────────────────────────
// Palette
// ─────────────────────────────────────────

const C = {
  ink:       '#1A1208',
  inkLight:  '#2D1F0A',
  parchment: '#F5EAD6',
  parchDark: '#E8D5B0',
  parchDeep: '#D4B880',
  blood:     '#8B1A1A',
  bloodDim:  '#5A1010',
  gold:      '#B8860B',
  goldLight: '#D4A017',
  mist:      '#6B7C6E',
  mistDark:  '#3A4A3C',
  green:     '#2A5A3A',
  greenLight:'#4A8A5A',
};

// Danger → background tint for region rows
const DANGER_BG: Record<number, string> = {
  1:  '#F5F0E8',
  3:  '#F2EDE0',
  4:  '#EEEADA',
  5:  '#EAE4D0',
  6:  '#E6DEC8',
  8:  '#E2D4BC',
  9:  '#DCC8AC',
  10: '#D4B89A',
};

// ─────────────────────────────────────────
// MapScreen
// ─────────────────────────────────────────

export function MapScreen({ gameState, onToast }: Props) {
  const [selectedId, setSelectedId]     = useState<number>(gameState.currentLocationId);
  const [detailSlide]                   = useState(new Animated.Value(20));
  const [detailOpacity]                 = useState(new Animated.Value(0));

  const mapScrollRef = useRef<ScrollView>(null);
  const hasScrolled  = useRef(false);

  const selectedLocation = getLocation(selectedId);
  const currentRegion    = getRegion(gameState.currentLocationId);

  // ── Auto-scroll to current location on first render ──────

  useEffect(() => {
    if (hasScrolled.current) return;
    const currentIdx    = LOCATIONS.findIndex(l => l.id === gameState.currentLocationId);
    // Approximate x offset: each node is NODE_SIZE + CONNECTOR_WIDTH
    const approxX       = currentIdx * (NODE_SIZE + CONNECTOR_WIDTH) - 120;
    setTimeout(() => {
      mapScrollRef.current?.scrollTo({ x: Math.max(0, approxX), animated: false });
      hasScrolled.current = true;
    }, 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Animate detail card in when selection changes ─────────

  const animateDetail = useCallback(() => {
    detailSlide.setValue(14);
    detailOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(detailSlide,   { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(detailOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [detailSlide, detailOpacity]);

  const handleSelect = useCallback((locId: number) => {
    setSelectedId(locId);
    animateDetail();
  }, [animateDetail]);

  // ── Group locations by region ─────────────────────────────

  const regionRows = REGIONS.map(region => ({
    region,
    locations: LOCATIONS.filter(
      l => l.id >= region.locationRange[0] && l.id <= region.locationRange[1],
    ),
  }));

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────

  return (
    <View style={s.root}>

      {/* ── HEADER ── */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>The East Senin Road</Text>
          <Text style={s.headerSub}>
            Location {gameState.currentLocationId} of 125
            {'  ·  '}Day {gameState.dayNumber} of 100
          </Text>
        </View>
        <ProgressPill gameState={gameState} />
      </View>

      {/* ── REGION LEGEND (horizontal scroll) ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.legendScroll}
        contentContainerStyle={s.legendContent}
      >
        {REGIONS.map(r => (
          <View
            key={r.name}
            style={[
              s.legendPill,
              r.name === currentRegion.name && s.legendPillActive,
            ]}
          >
            <Text style={[
              s.legendPillText,
              r.name === currentRegion.name && s.legendPillTextActive,
            ]}>
              {r.name}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* ── MAP: region rows, each horizontally scrollable ── */}
      <ScrollView
        ref={mapScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.mapScroll}
        contentContainerStyle={s.mapContent}
      >
        {/* Region label column (sticky-ish — scrolls with map) */}
        <View style={s.regionLabels}>
          {regionRows.map(({ region }) => (
            <RegionLabel
              key={region.name}
              region={region}
              isCurrent={region.name === currentRegion.name}
            />
          ))}
        </View>

        {/* Node rows */}
        <View>
          {regionRows.map(({ region, locations }) => (
            <RegionRow
              key={region.name}
              region={region}
              locations={locations}
              currentId={gameState.currentLocationId}
              selectedId={selectedId}
              visitedIds={gameState.visitedLocationIds}
              onSelect={handleSelect}
            />
          ))}
        </View>
      </ScrollView>

      {/* ── NODE LEGEND ── */}
      <NodeLegend />

      {/* ── DETAIL CARD ── */}
      <Animated.View style={[
        s.detailCard,
        { opacity: detailOpacity, transform: [{ translateY: detailSlide }] },
      ]}>
        <LocationDetail
          location={selectedLocation}
          isCurrent={selectedLocation.id === gameState.currentLocationId}
          isVisited={gameState.visitedLocationIds.has(selectedLocation.id)}
          gameState={gameState}
        />
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────
// Region label (left column)
// ─────────────────────────────────────────

function RegionLabel({
  region,
  isCurrent,
}: {
  region:    RegionDefinition;
  isCurrent: boolean;
}) {
  return (
    <View style={[s.regionLabelCell, isCurrent && s.regionLabelCellActive]}>
      <Text style={[s.regionLabelText, isCurrent && s.regionLabelTextActive]}
        numberOfLines={2}
      >
        {region.name}
      </Text>
      <DangerPips level={region.dangerLevel} />
    </View>
  );
}

function DangerPips({ level }: { level: number }) {
  // Show 1–5 pips for danger 1–10 (2 danger per pip)
  const pips = Math.ceil(level / 2);
  return (
    <View style={s.dangerPips}>
      {Array.from({ length: 5 }).map((_, i) => (
        <View
          key={i}
          style={[s.dangerPip, i < pips && { backgroundColor: dangerColour(level) }]}
        />
      ))}
    </View>
  );
}

function dangerColour(level: number): string {
  if (level >= 9)  return C.blood;
  if (level >= 7)  return '#AA4422';
  if (level >= 5)  return '#AA7722';
  if (level >= 3)  return C.gold;
  return C.greenLight;
}

// ─────────────────────────────────────────
// One region row of nodes
// ─────────────────────────────────────────

function RegionRow({
  region,
  locations,
  currentId,
  selectedId,
  visitedIds,
  onSelect,
}: {
  region:    RegionDefinition;
  locations: Location[];
  currentId: number;
  selectedId:number;
  visitedIds:Set<number>;
  onSelect:  (id: number) => void;
}) {
  const bg = DANGER_BG[region.dangerLevel] ?? C.parchDark;

  return (
    <View style={[s.regionRow, { backgroundColor: bg }]}>
      {locations.map((loc, i) => {
        const isCurrent  = loc.id === currentId;
        const isSelected = loc.id === selectedId;
        const isVisited  = visitedIds.has(loc.id);
        const isFuture   = loc.id > currentId;
        const isShop     = SHOP_LOCATION_IDS.includes(loc.id);
        const isBoss     = BOSS_LOCATION_IDS.includes(loc.id);
        const isLast     = i === locations.length - 1;

        return (
          <View key={loc.id} style={s.nodeWrapper}>
            {/* Connector line (before node, not before the very first) */}
            {i > 0 && (
              <View style={[
                s.connector,
                isVisited && !isCurrent && s.connectorVisited,
                isFuture && s.connectorFuture,
              ]} />
            )}

            {/* Node */}
            <TouchableOpacity
              onPress={() => onSelect(loc.id)}
              activeOpacity={0.75}
              style={[
                s.node,
                isCurrent  && s.nodeCurrent,
                isSelected && !isCurrent && s.nodeSelected,
                isVisited  && !isCurrent && s.nodeVisited,
                isFuture   && s.nodeFuture,
                isShop     && !isCurrent && s.nodeShop,
                isBoss     && !isCurrent && s.nodeBoss,
              ]}
            >
              <Text style={[
                s.nodeText,
                isCurrent  && s.nodeTextCurrent,
                isFuture   && s.nodeTextFuture,
              ]}>
                {loc.id}
              </Text>

              {/* Town dot */}
              {loc.isTown && !isCurrent && (
                <View style={[s.nodeDot, { backgroundColor: isShop ? C.gold : C.greenLight }]} />
              )}
            </TouchableOpacity>

            {/* Connector after last node in region (bridge to next region) */}
            {isLast && (
              <View style={[s.connector, s.connectorRegionBridge]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────
// Node legend
// ─────────────────────────────────────────

function NodeLegend() {
  const items = [
    { style: [s.legendNode, s.nodeCurrent],  label: 'You are here' },
    { style: [s.legendNode, s.nodeShop],     label: 'Town / Shop' },
    { style: [s.legendNode, s.nodeBoss],     label: 'Boss fight' },
    { style: [s.legendNode, s.nodeVisited],  label: 'Visited' },
    { style: [s.legendNode, s.nodeFuture],   label: 'Ahead' },
  ];
  return (
    <View style={s.nodeLegend}>
      {items.map(({ style, label }) => (
        <View key={label} style={s.nodeLegendItem}>
          <View style={style as any} />
          <Text style={s.nodeLegendText}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────
// Progress pill (top right)
// ─────────────────────────────────────────

function ProgressPill({ gameState }: { gameState: GameState }) {
  const locPct  = Math.round((gameState.currentLocationId / 125) * 100);
  const dayPct  = Math.round((gameState.dayNumber / 100) * 100);
  const onPace  = locPct >= dayPct;

  return (
    <View style={s.progressPill}>
      <Text style={[s.progressPct, { color: onPace ? C.greenLight : C.blood }]}>
        {locPct}%
      </Text>
      <Text style={s.progressLabel}>of road</Text>
      <Text style={[s.progressPace, { color: onPace ? C.greenLight : C.blood }]}>
        {onPace ? 'On pace' : 'Behind'}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────
// Location detail card
// ─────────────────────────────────────────

function LocationDetail({
  location,
  isCurrent,
  isVisited,
  gameState,
}: {
  location:  Location;
  isCurrent: boolean;
  isVisited: boolean;
  gameState: GameState;
}) {
  const region    = getRegion(location.id);
  const isShop    = SHOP_LOCATION_IDS.includes(location.id);
  const isBoss    = BOSS_LOCATION_IDS.includes(location.id);
  const nextShop  = SHOP_LOCATION_IDS.find(id => id > gameState.currentLocationId);
  const distToShop= nextShop ? nextShop - gameState.currentLocationId : null;

  // Mobs summary
  const mobSummary = location.mobs
    .filter(m => m.aggroPct > 0)
    .sort((a, b) => b.aggroPct - a.aggroPct)
    .slice(0, 3)
    .map(m => `${m.name} ${m.aggroPct}%`)
    .join('  ·  ');

  return (
    <View style={s.detail}>
      {/* Location header */}
      <View style={s.detailHeader}>
        <View style={s.detailHeaderLeft}>
          <Text style={s.detailId}>#{location.id}</Text>
          <View>
            <Text style={s.detailName}>{location.name}</Text>
            <Text style={s.detailRegion}>{region.name}</Text>
          </View>
        </View>

        {/* Status badges */}
        <View style={s.detailBadges}>
          {isCurrent && (
            <View style={[s.badge, { backgroundColor: C.gold + '33', borderColor: C.gold }]}>
              <Text style={[s.badgeText, { color: C.goldLight }]}>You are here</Text>
            </View>
          )}
          {isVisited && !isCurrent && (
            <View style={[s.badge, { backgroundColor: C.inkLight + '22', borderColor: C.mist }]}>
              <Text style={[s.badgeText, { color: C.mist }]}>Visited</Text>
            </View>
          )}
          {isShop && (
            <View style={[s.badge, { backgroundColor: C.gold + '22', borderColor: C.gold }]}>
              <Text style={[s.badgeText, { color: C.gold }]}>Shop</Text>
            </View>
          )}
          {isBoss && (
            <View style={[s.badge, { backgroundColor: C.blood + '22', borderColor: C.blood }]}>
              <Text style={[s.badgeText, { color: C.blood }]}>
                Boss · Lv {location.bossLevel ?? '?'}+
              </Text>
            </View>
          )}
          {location.isTown && !isShop && (
            <View style={[s.badge, { backgroundColor: C.greenLight + '22', borderColor: C.greenLight }]}>
              <Text style={[s.badgeText, { color: C.greenLight }]}>Town</Text>
            </View>
          )}
        </View>
      </View>

      {/* Divider */}
      <View style={s.detailDivider} />

      {/* Info columns */}
      <View style={s.detailCols}>

        {/* Actions available */}
        <View style={s.detailCol}>
          <Text style={s.detailColTitle}>Actions</Text>
          {location.actions.canSteal    && <DetailLine icon="◆" text="Steal" />}
          {location.actions.huntYield   && <DetailLine icon="▲" text={`Hunt ×${location.actions.huntYield}`} />}
          {location.actions.restQuality && <DetailLine icon="◇" text={`Rest ×${location.actions.restQuality}`} />}
          {location.isTown              && <DetailLine icon="◈" text="Trade" />}
          {!location.actions.canSteal &&
           !location.actions.huntYield &&
           !location.actions.restQuality &&
           !location.isTown             && (
            <Text style={s.detailNone}>Move only</Text>
          )}
        </View>

        {/* Threats */}
        <View style={s.detailCol}>
          <Text style={s.detailColTitle}>Threats</Text>
          {location.mobs.filter(m => m.aggroPct > 0).length > 0 ? (
            location.mobs
              .filter(m => m.aggroPct > 0)
              .sort((a, b) => b.aggroPct - a.aggroPct)
              .slice(0, 3)
              .map(m => (
                <DetailLine
                  key={m.name}
                  icon="⚔"
                  text={`${m.name}`}
                  sub={`${m.aggroPct}%`}
                  subColor={m.aggroPct >= 40 ? C.blood : C.mist}
                />
              ))
          ) : (
            <Text style={s.detailNone}>Safe passage</Text>
          )}
        </View>
      </View>

      {/* Location text */}
      {location.locationText && (
        <Text style={s.detailFlavorText} numberOfLines={2}>
          {location.locationText}
        </Text>
      )}

      {/* Next shop hint */}
      {!isShop && distToShop !== null && distToShop > 0 && distToShop <= 15 && (
        <View style={s.shopHint}>
          <Text style={s.shopHintText}>
            ★ Next shop: {SHOP_LOCATION_IDS.find(id => id > gameState.currentLocationId)
              ? getLocation(SHOP_LOCATION_IDS.find(id => id > gameState.currentLocationId)!).name
              : '?'}
            {' '}({distToShop} location{distToShop !== 1 ? 's' : ''} ahead)
          </Text>
        </View>
      )}
    </View>
  );
}

function DetailLine({
  icon, text, sub, subColor,
}: {
  icon:      string;
  text:      string;
  sub?:      string;
  subColor?: string;
}) {
  return (
    <View style={s.detailLine}>
      <Text style={s.detailLineIcon}>{icon}</Text>
      <Text style={s.detailLineText}>{text}</Text>
      {sub && (
        <Text style={[s.detailLineSub, subColor ? { color: subColor } : {}]}>{sub}</Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: C.parchment,
  },

  // Header
  header: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingHorizontal: 14,
    paddingTop:      12,
    paddingBottom:   8,
    borderBottomWidth: 1,
    borderBottomColor: C.parchDeep,
    backgroundColor: C.parchment,
  },
  headerTitle: {
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    15,
    color:       C.ink,
    letterSpacing: 0.8,
  },
  headerSub: {
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    12,
    color:       C.mist,
    marginTop:   2,
  },

  // Progress pill
  progressPill: {
    alignItems:  'center',
    backgroundColor: C.parchDark,
    borderWidth:     1,
    borderColor:     C.parchDeep,
    borderRadius:    4,
    paddingHorizontal: 10,
    paddingVertical:    6,
  },
  progressPct: {
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    16,
    letterSpacing: 0.5,
  },
  progressLabel: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    8,
    color:       C.mist,
    letterSpacing: 0.5,
  },
  progressPace: {
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    11,
    marginTop:   1,
  },

  // Region legend
  legendScroll: {
    maxHeight:       32,
    backgroundColor: C.parchDark,
    borderBottomWidth: 1,
    borderBottomColor: C.parchDeep,
  },
  legendContent: {
    flexDirection: 'row',
    alignItems:    'center',
    paddingHorizontal: 10,
    gap:           6,
    paddingVertical: 5,
  },
  legendPill: {
    borderWidth:     1,
    borderColor:     C.parchDeep,
    borderRadius:    2,
    paddingHorizontal: 7,
    paddingVertical:   2,
  },
  legendPillActive: {
    backgroundColor: C.ink,
    borderColor:     C.ink,
  },
  legendPillText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    9,
    color:       C.mist,
    letterSpacing: 0.5,
  },
  legendPillTextActive: {
    color: C.parchment,
  },

  // Map scroll area
  mapScroll: {
    flex: 1,
  },
  mapContent: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    paddingBottom: 4,
  },

  // Region label column
  regionLabels: {
    width:           REGION_LABEL_W,
    flexDirection:   'column',
  },
  regionLabelCell: {
    height:          ROW_HEIGHT,
    justifyContent:  'center',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.parchDeep + '88',
    borderRightWidth:  1,
    borderRightColor:  C.parchDeep,
    backgroundColor:   C.parchDark,
  },
  regionLabelCellActive: {
    backgroundColor: C.ink,
  },
  regionLabelText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    8,
    color:       C.mist,
    letterSpacing: 0.4,
    lineHeight:  11,
    marginBottom: 3,
  },
  regionLabelTextActive: {
    color: C.parchment,
  },
  dangerPips: {
    flexDirection: 'row',
    gap:           2,
  },
  dangerPip: {
    width:           5,
    height:          5,
    borderRadius:    3,
    backgroundColor: C.parchDeep,
  },

  // Region row
  regionRow: {
    height:          ROW_HEIGHT,
    flexDirection:   'row',
    alignItems:      'center',
    borderBottomWidth: 1,
    borderBottomColor: C.parchDeep + '66',
    paddingHorizontal: 4,
  },

  // Node + connector
  nodeWrapper: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  connector: {
    width:           CONNECTOR_WIDTH,
    height:          2,
    backgroundColor: C.parchDeep,
  },
  connectorVisited: {
    backgroundColor: C.inkLight,
  },
  connectorFuture: {
    backgroundColor: C.parchDeep,
    opacity:         0.45,
  },
  connectorRegionBridge: {
    width:           8,
    backgroundColor: C.parchDeep,
    opacity:         0.4,
  },
  node: {
    width:           NODE_SIZE,
    height:          NODE_SIZE,
    borderRadius:    NODE_SIZE / 2,
    borderWidth:     1.5,
    borderColor:     C.parchDeep,
    backgroundColor: C.parchment,
    alignItems:      'center',
    justifyContent:  'center',
    position:        'relative',
  },
  nodeCurrent: {
    width:           NODE_SIZE_CURR,
    height:          NODE_SIZE_CURR,
    borderRadius:    NODE_SIZE_CURR / 2,
    backgroundColor: C.gold,
    borderColor:     C.ink,
    borderWidth:     2,
  },
  nodeSelected: {
    borderColor:     C.inkLight,
    borderWidth:     2,
    backgroundColor: C.parchDark,
  },
  nodeVisited: {
    backgroundColor: C.parchDark,
    borderColor:     C.inkLight,
  },
  nodeFuture: {
    opacity:         0.4,
  },
  nodeShop: {
    borderColor:     C.gold,
    backgroundColor: '#F5E8C0',
    borderWidth:     2,
  },
  nodeBoss: {
    borderColor:     C.blood,
    backgroundColor: '#F5E0E0',
    borderWidth:     2,
  },
  nodeText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    7,
    color:       C.inkLight,
    letterSpacing: 0,
  },
  nodeTextCurrent: {
    fontSize:    8,
    color:       C.ink,
    fontFamily:  'Cinzel_600SemiBold',
  },
  nodeTextFuture: {
    color: C.parchDeep,
  },
  nodeDot: {
    position:        'absolute',
    bottom:          1,
    right:           1,
    width:           6,
    height:          6,
    borderRadius:    3,
  },

  // Node legend
  nodeLegend: {
    flexDirection:   'row',
    flexWrap:        'wrap',
    gap:             10,
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderTopWidth:  1,
    borderTopColor:  C.parchDeep,
    backgroundColor: C.parchDark,
  },
  nodeLegendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },
  legendNode: {
    width:        14,
    height:       14,
    borderRadius: 7,
    borderWidth:  1.5,
    borderColor:  C.parchDeep,
    backgroundColor: C.parchment,
  },
  nodeLegendText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    9,
    color:       C.mist,
    letterSpacing: 0.3,
  },

  // Detail card
  detailCard: {
    backgroundColor: C.parchment,
    borderTopWidth:  2,
    borderTopColor:  C.parchDeep,
  },
  detail: {
    padding: 12,
  },
  detailHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   8,
  },
  detailHeaderLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    flex:          1,
  },
  detailId: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    11,
    color:       C.mist,
    letterSpacing: 0.5,
    minWidth:    24,
  },
  detailName: {
    fontFamily:  'Cinzel_600SemiBold',
    fontSize:    15,
    color:       C.ink,
    letterSpacing: 0.5,
  },
  detailRegion: {
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    12,
    color:       C.mist,
    marginTop:   1,
  },
  detailBadges: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           4,
    justifyContent:'flex-end',
    maxWidth:      130,
  },
  badge: {
    borderWidth:     1,
    borderRadius:    2,
    paddingHorizontal: 5,
    paddingVertical:   2,
  },
  badgeText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    9,
    letterSpacing: 0.5,
  },
  detailDivider: {
    height:          1,
    backgroundColor: C.parchDeep,
    marginBottom:    8,
  },
  detailCols: {
    flexDirection: 'row',
    gap:           12,
    marginBottom:  6,
  },
  detailCol: {
    flex: 1,
  },
  detailColTitle: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    9,
    color:       C.mist,
    letterSpacing: 1,
    marginBottom:  5,
    textTransform: 'uppercase',
  },
  detailNone: {
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    12,
    color:       C.mist,
  },
  detailLine: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
    marginBottom:  3,
  },
  detailLineIcon: {
    fontSize:    10,
    color:       C.mist,
    width:       12,
  },
  detailLineText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    10,
    color:       C.ink,
    flex:        1,
  },
  detailLineSub: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    9,
    color:       C.mist,
    letterSpacing: 0.3,
  },
  detailFlavorText: {
    fontFamily:  'CrimsonText_400Regular_Italic',
    fontSize:    12,
    color:       C.mist,
    lineHeight:  18,
    marginTop:   6,
    borderTopWidth: 1,
    borderTopColor: C.parchDeep,
    paddingTop:  6,
  },
  shopHint: {
    marginTop:       6,
    backgroundColor: C.gold + '18',
    borderWidth:     1,
    borderColor:     C.gold + '55',
    borderRadius:    2,
    paddingHorizontal: 8,
    paddingVertical:   4,
  },
  shopHintText: {
    fontFamily:  'Cinzel_400Regular',
    fontSize:    10,
    color:       C.gold,
    letterSpacing: 0.3,
  },
});
