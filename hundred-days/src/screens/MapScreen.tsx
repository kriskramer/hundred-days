import {
  useState,
  useRef,
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
// Palette — dark ink theme
// ─────────────────────────────────────────

const C = {
  bg:         '#1A0F05',
  bgCard:     '#2E1E08',
  bgCardDark: '#1E1005',
  parchment:  '#F5EAD0',
  parchDark:  '#E8D5A3',
  gold:       '#B8860B',
  goldLight:  '#D4A017',
  blood:      '#8B1A1A',
  green:      '#3A5C2A',
  greenLight: '#8FCC70',
  blue:       '#1A3A5C',
  blueLight:  '#70A8CC',
  purple:     '#502050',
  purpleLight:'#CC88CC',
  mist:       '#A0B8AA',
  faded:      'rgba(212,160,23,0.55)',
};

// ─────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────

const SPINE_W = 44;   // width of the centre spine column
const DOT_W   = 14;   // road-dot diameter

// ─────────────────────────────────────────
// Item list type — region banners + loc rows
// ─────────────────────────────────────────

type Item =
  | { kind: 'region';   region: RegionDefinition }
  | { kind: 'location'; loc: Location; side: 'left' | 'right' };

function buildItems(): Item[] {
  const items: Item[] = [];
  let sideIndex = 0;
  for (const region of REGIONS) {
    items.push({ kind: 'region', region });
    const locs = LOCATIONS.filter(
      l => l.id >= region.locationRange[0] && l.id <= region.locationRange[1],
    );
    for (const loc of locs) {
      items.push({ kind: 'location', loc, side: sideIndex % 2 === 0 ? 'left' : 'right' });
      sideIndex++;
    }
  }
  return items;
}

const ITEMS = buildItems();

// ─────────────────────────────────────────
// MapScreen
// ─────────────────────────────────────────

export function MapScreen({ gameState, onToast }: Props) {
  const [selectedId, setSelectedId]       = useState<number>(gameState.currentLocationId);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailSlide]                     = useState(new Animated.Value(320));
  const [showAll, setShowAll]             = useState(false);
  const scrollRef                         = useRef<ScrollView>(null);

  const selectedLocation = getLocation(selectedId);
  const currentId        = gameState.currentLocationId;

  // Nearby window: 3 behind, 4 ahead (+ any region banners that overlap the window)
  const visibleItems = showAll ? ITEMS : ITEMS.filter(item => {
    if (item.kind === 'location') {
      return item.loc.id >= currentId - 3 && item.loc.id <= currentId + 4;
    }
    const [start, end] = item.region.locationRange;
    return start <= currentId + 4 && end >= currentId - 3;
  });

  // Auto-scroll to current location when expanding to full view
  useEffect(() => {
    if (!showAll) return;
    const idx = LOCATIONS.findIndex(l => l.id === currentId);
    // Each row ≈54px; each region banner ≈50px; rough: one banner per ~12 locations
    const approxY = idx * 54 + Math.ceil(idx / 12) * 50 - 180;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, approxY), animated: false });
    }, 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  const openDetail = useCallback((locId: number) => {
    setSelectedId(locId);
    detailSlide.setValue(320);
    setDetailVisible(true);
    Animated.timing(detailSlide, {
      toValue:         0,
      duration:        240,
      useNativeDriver: true,
    }).start();
  }, [detailSlide]);

  const closeDetail = useCallback(() => {
    Animated.timing(detailSlide, {
      toValue:         320,
      duration:        200,
      useNativeDriver: true,
    }).start(() => setDetailVisible(false));
  }, [detailSlide]);

  return (
    <View style={s.root}>

      {/* Header */}
      <MapHeader gameState={gameState} />

      {/* Nearby / Show all toggle */}
      <TouchableOpacity
        onPress={() => setShowAll(v => !v)}
        activeOpacity={0.7}
        style={s.toggleRow}
      >
        <Text style={s.toggleText}>
          {showAll ? '▲  NEARBY ONLY' : '▼  SHOW ALL LOCATIONS'}
        </Text>
      </TouchableOpacity>

      {/* Vertical road map */}
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        {visibleItems.map(item => {
          if (item.kind === 'region') {
            return (
              <RegionBanner
                key={`r-${item.region.name}`}
                region={item.region}
              />
            );
          }
          const { loc, side } = item;
          return (
            <LocationRow
              key={loc.id}
              loc={loc}
              side={side}
              isCurrent={loc.id === gameState.currentLocationId}
              isVisited={gameState.visitedLocationIds.has(loc.id)}
              isSelected={loc.id === selectedId}
              onPress={openDetail}
            />
          );
        })}

        {/* End destination */}
        <Destination />
      </ScrollView>

      {/* Slide-up detail panel */}
      {detailVisible && (
        <Animated.View
          style={[s.detailPanel, { transform: [{ translateY: detailSlide }] }]}
        >
          <LocationDetail
            location={selectedLocation}
            isCurrent={selectedLocation.id === gameState.currentLocationId}
            isVisited={gameState.visitedLocationIds.has(selectedLocation.id)}
            gameState={gameState}
            onClose={closeDetail}
          />
        </Animated.View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────
// Header
// ─────────────────────────────────────────

function MapHeader({ gameState }: { gameState: GameState }) {
  const locPct = Math.round((gameState.currentLocationId / 125) * 100);
  const dayPct = Math.round((gameState.dayNumber       / 100) * 100);
  const onPace = locPct >= dayPct;

  return (
    <View style={s.header}>
      <View>
        <Text style={s.headerTitle}>The East Senin Road</Text>
        <Text style={s.headerSub}>
          Loc {gameState.currentLocationId} / 125{'  ·  '}Day {gameState.dayNumber} / 100
        </Text>
      </View>

      <View style={s.pacePill}>
        <Text style={[s.pacePct, { color: onPace ? C.greenLight : C.blood }]}>
          {locPct}%
        </Text>
        <Text style={[s.paceLabel, { color: onPace ? C.greenLight : C.blood }]}>
          {onPace ? 'ON PACE' : 'BEHIND'}
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────
// Region banner
// ─────────────────────────────────────────

function RegionBanner({ region }: { region: RegionDefinition }) {
  return (
    <View style={s.regionBanner}>
      <View style={s.regionBannerLine} />
      <Text style={s.regionBannerText}>{region.name}</Text>
      <View style={s.regionBannerLine} />
    </View>
  );
}

// ─────────────────────────────────────────
// Location row (alternating left / right)
// ─────────────────────────────────────────

function LocationRow({
  loc, side, isCurrent, isVisited, isSelected, onPress,
}: {
  loc:        Location;
  side:       'left' | 'right';
  isCurrent:  boolean;
  isVisited:  boolean;
  isSelected: boolean;
  onPress:    (id: number) => void;
}) {
  const isShop = SHOP_LOCATION_IDS.includes(loc.id);
  const isBoss = BOSS_LOCATION_IDS.includes(loc.id);
  const isFuture = !isCurrent && !isVisited;

  const card = (
    <TouchableOpacity
      onPress={() => onPress(loc.id)}
      activeOpacity={0.75}
      style={[
        s.card,
        isCurrent  && s.cardCurrent,
        isSelected && !isCurrent && s.cardSelected,
        isVisited  && !isCurrent && s.cardVisited,
        isFuture   && s.cardFuture,
      ]}
    >
      {/* "You are here" tag */}
      {isCurrent && (
        <Text style={s.cardHereTag}>◀ YOU ARE HERE</Text>
      )}

      <Text style={s.cardId}>#{loc.id}</Text>
      <Text style={s.cardName} numberOfLines={1}>{loc.name}</Text>

      {/* Badges */}
      <View style={s.cardBadges}>
        {loc.isTown && !isShop && <Badge label="Town"   color={C.greenLight} bg="rgba(58,92,42,0.5)"   border="rgba(58,92,42,0.8)"   />}
        {isShop              && <Badge label="Shop"   color={C.blueLight}  bg="rgba(26,58,92,0.5)"   border="rgba(26,58,92,0.9)"   />}
        {isBoss              && <Badge label="Boss"   color="#FF8080"      bg="rgba(139,26,26,0.5)"  border="rgba(139,26,26,0.9)"  />}
      </View>

      {/* Mob summary */}
      {loc.mobs.filter(m => m.aggroPct > 0).length > 0 && (
        <Text style={s.cardMobs} numberOfLines={1}>
          {loc.mobs
            .filter(m => m.aggroPct > 0)
            .sort((a, b) => b.aggroPct - a.aggroPct)
            .slice(0, 2)
            .map(m => m.name)
            .join('  ·  ')}
        </Text>
      )}
    </TouchableOpacity>
  );

  const spacer = <View style={s.cardSpacer} />;

  return (
    <View style={s.row}>
      {/* Left half */}
      {side === 'left' ? card : spacer}

      {/* Centre spine column */}
      <View style={s.spineCol}>
        <View style={s.spineLine} />
        <View style={[
          s.dot,
          isCurrent && s.dotCurrent,
          isVisited && !isCurrent && s.dotVisited,
          isFuture  && s.dotFuture,
        ]} />
      </View>

      {/* Right half */}
      {side === 'right' ? card : spacer}
    </View>
  );
}

function Badge({ label, color, bg, border }: {
  label:  string;
  color:  string;
  bg:     string;
  border: string;
}) {
  return (
    <View style={[s.badge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────
// Destination footer
// ─────────────────────────────────────────

function Destination() {
  return (
    <View style={s.dest}>
      <Text style={s.destIcon}>⚑</Text>
      <Text style={s.destName}>THE BLASTED LANDS</Text>
      <Text style={s.destSub}>Where Roachak waits</Text>
    </View>
  );
}

// ─────────────────────────────────────────
// Detail panel (slide-up)
// ─────────────────────────────────────────

function LocationDetail({
  location, isCurrent, isVisited, gameState, onClose,
}: {
  location:  Location;
  isCurrent: boolean;
  isVisited: boolean;
  gameState: GameState;
  onClose:   () => void;
}) {
  const region    = getRegion(location.id);
  const isShop    = SHOP_LOCATION_IDS.includes(location.id);
  const isBoss    = BOSS_LOCATION_IDS.includes(location.id);
  const nextShop  = SHOP_LOCATION_IDS.find(id => id > gameState.currentLocationId);
  const distToShop = nextShop ? nextShop - gameState.currentLocationId : null;

  return (
    <ScrollView style={s.detail} showsVerticalScrollIndicator={false}>
      {/* Close button */}
      <TouchableOpacity onPress={onClose} style={s.detailClose}>
        <Text style={s.detailCloseText}>✕</Text>
      </TouchableOpacity>

      {/* Id + name */}
      <Text style={s.detailId}>#{location.id}</Text>
      <Text style={s.detailName}>{location.name}</Text>
      <Text style={s.detailRegion}>{region.name}</Text>

      {/* Status badges */}
      <View style={s.detailBadges}>
        {isCurrent && (
          <Badge label="You are here" color={C.goldLight} bg="rgba(184,134,11,0.18)" border="rgba(184,134,11,0.6)" />
        )}
        {isVisited && !isCurrent && (
          <Badge label="Visited" color={C.mist} bg="rgba(80,80,80,0.25)" border="rgba(120,120,120,0.35)" />
        )}
        {isShop && (
          <Badge label="Shop" color={C.blueLight} bg="rgba(26,58,92,0.5)" border="rgba(26,58,92,0.9)" />
        )}
        {isBoss && (
          <Badge label={`Boss · Lv ${location.bossLevel ?? '?'}+`} color="#FF8080" bg="rgba(139,26,26,0.5)" border="rgba(139,26,26,0.9)" />
        )}
        {location.isTown && !isShop && (
          <Badge label="Town" color={C.greenLight} bg="rgba(58,92,42,0.5)" border="rgba(58,92,42,0.8)" />
        )}
      </View>

      {/* Divider */}
      <View style={s.detailDivider} />

      {/* Actions + Threats columns */}
      <View style={s.detailCols}>
        <View style={s.detailCol}>
          <Text style={s.detailColLabel}>ACTIONS</Text>
          {location.actions.huntYield   != null && <DetailLine icon="▲" text={`Hunt  ×${location.actions.huntYield}`} />}
          {location.actions.restQuality != null && <DetailLine icon="◇" text={`Rest  ×${location.actions.restQuality}`} />}
          {location.actions.canSteal             && <DetailLine icon="◆" text="Steal" />}
          {location.isTown                       && <DetailLine icon="◈" text="Trade" />}
          {!location.actions.huntYield &&
           !location.actions.restQuality &&
           !location.actions.canSteal &&
           !location.isTown && (
            <Text style={s.detailNone}>Move only</Text>
          )}
        </View>

        <View style={s.detailCol}>
          <Text style={s.detailColLabel}>THREATS</Text>
          {location.mobs.filter(m => m.aggroPct > 0).length > 0 ? (
            location.mobs
              .filter(m => m.aggroPct > 0)
              .sort((a, b) => b.aggroPct - a.aggroPct)
              .slice(0, 3)
              .map(m => (
                <DetailLine
                  key={m.name}
                  icon="⚔"
                  text={m.name}
                  sub={`${m.aggroPct}%`}
                  subColor={m.aggroPct >= 40 ? '#FF8080' : C.mist}
                />
              ))
          ) : (
            <Text style={s.detailNone}>Safe passage</Text>
          )}
        </View>
      </View>

      {/* Flavour text */}
      {location.locationText ? (
        <Text style={s.detailFlavour}>
          {location.locationText}
        </Text>
      ) : null}

      {/* Next shop hint */}
      {!isShop && distToShop !== null && distToShop > 0 && distToShop <= 15 && (
        <View style={s.shopHint}>
          <Text style={s.shopHintText}>
            ★ Next shop: {getLocation(nextShop!).name}{'  '}({distToShop} ahead)
          </Text>
        </View>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

function DetailLine({
  icon, text, sub, subColor,
}: {
  icon:       string;
  text:       string;
  sub?:       string;
  subColor?:  string;
}) {
  return (
    <View style={s.detailLine}>
      <Text style={s.detailLineIcon}>{icon}</Text>
      <Text style={s.detailLineText}>{text}</Text>
      {sub && <Text style={[s.detailLineSub, subColor ? { color: subColor } : {}]}>{sub}</Text>}
    </View>
  );
}

// ─────────────────────────────────────────
// Styles
// ─────────────────────────────────────────

const s = StyleSheet.create({

  root: {
    flex:            1,
    backgroundColor: C.bg,
  },

  // ── Header ────────────────────────────
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: 2,
    borderBottomColor: C.gold,
    backgroundColor:   '#0D0702',
  },
  headerTitle: {
    fontFamily:    'Cinzel_600SemiBold',
    fontSize:      14,
    color:         C.goldLight,
    letterSpacing: 1.2,
  },
  headerSub: {
    fontFamily:    'CrimsonText_400Regular_Italic',
    fontSize:      12,
    color:         C.parchDark,
    marginTop:     2,
  },
  pacePill: {
    alignItems:        'center',
    backgroundColor:   'rgba(184,134,11,0.12)',
    borderWidth:       1,
    borderColor:       'rgba(184,134,11,0.4)',
    borderRadius:      3,
    paddingHorizontal: 12,
    paddingVertical:    6,
  },
  pacePct: {
    fontFamily:    'Cinzel_600SemiBold',
    fontSize:      16,
    letterSpacing: 0.5,
  },
  paceLabel: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      8,
    letterSpacing: 1,
    marginTop:     1,
  },

  // ── Toggle row ────────────────────────
  toggleRow: {
    alignItems:        'center',
    paddingVertical:    8,
    borderBottomWidth:  1,
    borderBottomColor: 'rgba(184,134,11,0.2)',
    backgroundColor:   '#110A02',
  },
  toggleText: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      9,
    letterSpacing: 1.5,
    color:         C.gold,
    opacity:       0.7,
  },

  // ── Scroll ────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ── Region banner ─────────────────────
  regionBanner: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 10,
  },
  regionBannerLine: {
    flex:            1,
    height:          1,
    backgroundColor: 'rgba(184,134,11,0.35)',
  },
  regionBannerText: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      9,
    letterSpacing: 2.5,
    color:         C.gold,
    opacity:       0.75,
    textTransform: 'uppercase',
  },

  // ── Location row ──────────────────────
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    minHeight:      54,
    paddingVertical: 3,
  },

  // ── Spine column ──────────────────────
  spineCol: {
    width:           SPINE_W,
    alignItems:      'center',
    justifyContent:  'center',
    alignSelf:       'stretch',
    position:        'relative',
  },
  spineLine: {
    position:        'absolute',
    top:             0,
    bottom:          0,
    width:           2,
    backgroundColor: 'rgba(184,134,11,0.22)',
  },
  dot: {
    width:           DOT_W,
    height:          DOT_W,
    borderRadius:    DOT_W / 2,
    borderWidth:     2,
    borderColor:     'rgba(212,160,23,0.55)',
    backgroundColor: '#1A0F05',
    zIndex:          2,
  },
  dotCurrent: {
    backgroundColor: C.goldLight,
    borderColor:     C.goldLight,
    width:           18,
    height:          18,
    borderRadius:    9,
  },
  dotVisited: {
    borderColor:     'rgba(212,160,23,0.35)',
    backgroundColor: '#2E1E08',
  },
  dotFuture: {
    opacity: 0.35,
  },

  // ── Card ──────────────────────────────
  card: {
    flex:            1,
    marginHorizontal: 8,
    backgroundColor: C.bgCard,
    borderWidth:     1,
    borderColor:     'rgba(184,134,11,0.25)',
    borderRadius:    3,
    padding:         8,
    position:        'relative',
    overflow:        'hidden',
  },
  cardSpacer: {
    flex: 1,
  },
  cardCurrent: {
    borderColor:     C.goldLight,
    shadowColor:     C.goldLight,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.45,
    shadowRadius:    8,
    elevation:       6,
  },
  cardSelected: {
    borderColor:     'rgba(212,160,23,0.6)',
  },
  cardVisited: {
    opacity:     0.65,
    borderColor: 'rgba(184,134,11,0.12)',
  },
  cardFuture: {
    opacity: 0.45,
  },
  cardHereTag: {
    position:      'absolute',
    top:           5,
    right:         7,
    fontFamily:    'Cinzel_400Regular',
    fontSize:      7,
    letterSpacing: 0.8,
    color:         C.goldLight,
    opacity:       0.85,
  },
  cardId: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      9,
    color:         C.gold,
    opacity:       0.65,
    letterSpacing: 0.8,
    marginBottom:  2,
  },
  cardName: {
    fontFamily:    'Cinzel_600SemiBold',
    fontSize:      11,
    color:         C.parchment,
    letterSpacing: 0.3,
    marginBottom:  3,
  },
  cardBadges: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           4,
    marginBottom:  3,
  },
  cardMobs: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   11,
    color:      C.faded,
  },

  // ── Inline badge ──────────────────────
  badge: {
    borderWidth:       1,
    borderRadius:      2,
    paddingHorizontal: 5,
    paddingVertical:   2,
  },
  badgeText: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      8,
    letterSpacing: 0.5,
  },

  // ── Destination footer ────────────────
  dest: {
    alignItems:    'center',
    paddingTop:    28,
    paddingBottom: 16,
  },
  destIcon: {
    fontSize:     28,
    color:        C.blood,
    marginBottom:  6,
  },
  destName: {
    fontFamily:    'Cinzel_600SemiBold',
    fontSize:      13,
    color:         C.blood,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  destSub: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   13,
    color:      'rgba(200,174,138,0.5)',
    marginTop:   5,
  },

  // ── Detail panel ──────────────────────
  detailPanel: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    maxHeight:       '62%',
    backgroundColor: '#0D0702',
    borderTopWidth:  2,
    borderTopColor:  C.gold,
    paddingTop:      16,
    paddingHorizontal: 20,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: -4 },
    shadowOpacity:   0.6,
    shadowRadius:    12,
    elevation:       20,
  },
  detailClose: {
    position: 'absolute',
    top:      14,
    right:    18,
    zIndex:   10,
    padding:   4,
  },
  detailCloseText: {
    fontFamily: 'Cinzel_400Regular',
    fontSize:   16,
    color:      C.gold,
  },
  detailId: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      10,
    color:         C.gold,
    opacity:       0.65,
    letterSpacing: 1,
    marginBottom:  2,
  },
  detailName: {
    fontFamily:    'Cinzel_600SemiBold',
    fontSize:      20,
    color:         C.parchment,
    letterSpacing: 0.5,
    marginBottom:  2,
  },
  detailRegion: {
    fontFamily:    'CrimsonText_400Regular_Italic',
    fontSize:      13,
    color:         C.mist,
    marginBottom:  10,
  },
  detailBadges: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
    marginBottom:  12,
  },
  detailDivider: {
    height:          1,
    backgroundColor: 'rgba(184,134,11,0.25)',
    marginBottom:    12,
  },
  detailCols: {
    flexDirection: 'row',
    gap:           16,
    marginBottom:  10,
  },
  detailCol: {
    flex: 1,
  },
  detailColLabel: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      8,
    letterSpacing: 1.5,
    color:         C.gold,
    opacity:       0.7,
    marginBottom:  6,
  },
  detailNone: {
    fontFamily: 'CrimsonText_400Regular_Italic',
    fontSize:   13,
    color:      C.mist,
  },
  detailLine: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    marginBottom:   4,
  },
  detailLineIcon: {
    fontSize: 10,
    color:    C.mist,
    width:    14,
  },
  detailLineText: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      11,
    color:         C.parchDark,
    flex:          1,
    letterSpacing: 0.2,
  },
  detailLineSub: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      10,
    color:         C.mist,
    letterSpacing: 0.3,
  },
  detailFlavour: {
    fontFamily:    'CrimsonText_400Regular_Italic',
    fontSize:      14,
    color:         '#C8AE8A',
    lineHeight:    22,
    marginTop:     8,
    paddingTop:    10,
    borderTopWidth: 1,
    borderTopColor:'rgba(184,134,11,0.2)',
    paddingLeft:   12,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(184,134,11,0.35)',
  },
  shopHint: {
    marginTop:         10,
    backgroundColor:   'rgba(184,134,11,0.1)',
    borderWidth:       1,
    borderColor:       'rgba(184,134,11,0.35)',
    borderRadius:      2,
    paddingHorizontal: 10,
    paddingVertical:    6,
  },
  shopHintText: {
    fontFamily:    'Cinzel_400Regular',
    fontSize:      10,
    color:         C.gold,
    letterSpacing: 0.3,
  },
});
