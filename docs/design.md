# GulBar visual direction

## Default home: minimal grid (HomeMinimal)
White page, one typeface (Onest), black text, no accent colour — the photos supply all colour. Title, plain text
tabs ("who for": Hammasi / Onamga / Rafiqamga …) with a sliding underline, a count and a shop select, then a
4 / 3 / 2-column photo grid: name, price, shop name, a "+" button. Photos fade and settle in, rows stagger on
load, the add icon swaps to a check, the heart pops. 44px controls, `prefers-reduced-motion` respected.
Earlier drafts stay reachable for comparison: `/?home=wheel`, `/?home=feed`, `/?home=picker`.

## Draft: "Gul yorlig'i" feed (?home=feed)
A photo feed in which every bouquet carries a hanging kraft-paper price tag (handwritten price, Caveat).
The tag is the signature: it swings slowly (spring ~0.5 Hz, ±9°) when it scrolls into view, when touched and
when the bouquet is added, and leans a few degrees with scroll speed. Prices are also repeated inside the
add button so they stay visible next to the name.

Colour comes from the photos: the dominant hue of each image (canvas sampling, same-origin images only) tints
a mat behind the photo, and the page background drifts to a pale wash of the bouquet in the middle of the
screen (registered `--bg` custom property, 1.4 s transition). Everything else is ink on paper; kraft is the
single accent. Display Syne, text Onest, radius max 12px, Lucide icons.

Phone: compact intro (headline with an inline photo pill), one sticky bar with sideways-scrolling "who for"
chips and search / price-list icons, 6:7 photos. Tablet: two columns, second column dropped. Desktop: sticky
left column with a dotted-leader price index that tracks the bouquet in view, two offset photo columns.
"Who for" chips filter by the optional `audience` tags a florist sets per flower; untagged flowers show for all.

Motion: headline mask reveal with an inline photo pill; photo clip-path unveil + parallax; mat slides in;
chip highlight glides (shared layoutId); cards reorder with layout animation; add-to-cart icon swap.
`prefers-reduced-motion` removes transforms, swings and transitions.

## Alternate home: budget picker (?home=picker)
"Kimga? Qancha?" — headline word changes to the chosen person, budget slider with a dot per bouquet,
results as lead bouquet + price-board rows. Teal accent, Bricolage Grotesque.

No fictional reviews, delivery promises or discounts; seed data is demo.

## Draft: round wheel (?home=wheel)
One circular bouquet at a time on a drag/arrow wheel; page colour follows the bouquet; odometer price; add-to-cart flight.
