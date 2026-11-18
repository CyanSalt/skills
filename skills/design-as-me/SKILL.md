---
name: design-as-me
description: Guides new page design and existing-page refinement through this user's reusable design principles and aesthetic preferences. Applies a coherent visual hierarchy, concise information, purposeful color, and predictable interaction without prescribing layouts for particular sample pages.
---

# design-as-me

## Design principles and personal preferences

Follow this section as the single authoritative design rule set. Personal preferences
and general design rules have equal standing; neither is optional or secondary. Apply
these decisions to the page's purpose, not to a remembered sample. Retain accessibility
and correct functionality. Explain a genuine conflict instead of silently ignoring taste.

### 1. Concentrate color rather than washing out the interface

Prefer white backgrounds for ordinary functional interfaces. On white or dark-gray
surfaces, use a vivid, saturated accent for meaningful emphasis; restraint means using
color selectively, not making the accent dull. On a near-monochrome page, markers and
badges that carry warranted emphasis keep the same vivid accent rather than fading into
a pale tint; secondary markers stay quiet. Avoid broad pale-colored backgrounds without
a content-driven purpose. As a personal preference, avoid purple accents on ordinary
functional interfaces, including blue-labelled hues that appear violet in use: judge the
rendered hue, not its token name. This user associates purple with generic AI-generated
styling rather than a deliberate brand or theme; reserve it for an explicitly requested
purple brand or theme, not an assumed exception. By the same token, avoid pale cream or
pale-yellow washes on ordinary functional surfaces; they read as generic AI styling the
way purple does. A vivid accent need not be retired just because its rendered hue overlaps
a conventional semantic color such as success or error; pick saturation on merit rather
than backing off to dodge that overlap, while real success, error, and warning feedback
keep their own distinct role. Keep secondary information and routine
utilities quiet.
A deliberately book-like reading experience may use a quiet palette, including a warm
paper tone; that exception is scoped to a book-like reading context and does not license
a cream wash on every reader or on ordinary functional surfaces. Maintain a coherent
palette within every theme rather than treating all contexts identically. On a dark
surface, body content uses a light, near-neutral tone for legibility rather than reusing a
warm accent as text; accents stay reserved for emphasis.

### 2. Require every visible word to add information

Use the shortest wording that preserves meaning. Remove descriptions that restate labels,
explanations of an obvious layout, verbose counts, and repeated action context. Drop group
headings that their own options already make obvious, such as a label above a filter row or
an option group, and parenthetical asides that the options or layout already demonstrate. Prefer
brief action verbs and the localized word "Search" when the surrounding context supplies
the scope. Omit redundant qualifiers from an action label when its target or action
context is already supplied by the surrounding form. Keep idiomatic technical vocabulary in its conventional form
rather than translating or relabeling it: leave HTTP methods and primitive type names
such as string or integer as themselves. Retain copy for meaningful consequences,
unfamiliar actions, constraints, errors, and uncertain states. Visible copy fills only what
the icon, layout, or current state cannot already express; familiar icons and established
interaction conventions carry the meaning first. Do not pad a control with explanatory
words merely to satisfy accessibility — accessible names, semantics, and focus carry that
load — but do keep words for genuinely non-obvious actions, consequences, or risks. Drop
filler lead-ins that carry no information merely to keep sections structurally parallel;
if a section has no real lead-in, leave it out. Accessible names may be more explicit than visible copy.

### 3. Rank visual prominence by importance to the user

Make core content unmistakably larger and more prominent than supporting metadata:
give core titles a genuine, noticeable size step over metadata rather than a minor bump
that only registers on close comparison. By role, primary repeated-item titles — the
name of each entry in a repeating list — stay at least 16px, and the page or section
title steps larger still; this floor applies to core titles by role, not to every text
on the page, and secondary metadata does not join the larger size. Choose type size in proportion to the available
space; do not surround tiny text with large gaps. Layout and typography must agree when elevating content: if placement, a
column, or a row singles out a fact as core, raise its size to match instead of leaving
it small; in a uniform table or row layout, columns otherwise share one consistent text
role, so do not give a column the core size step unless that fact is genuinely the layout's
core. By role, the content needed to identify an item or to locate and time an activity
gets clear prominence, while supplemental descriptive copy stays quiet. Controls should be easy to find without becoming larger visual objects than
the content they act on. Give secondary grouping cues subdued color and normal weight,
never combining de-emphasis cues (small size, muted color) with bold emphasis, which
contradict each other. Treat form labels as primary text: size them above secondary
group headings instead of collapsing both at one small size; keep the heading quiet
while the label stays clearly readable. Secondary metadata must not steal attention
from primary content through a container, background, or emphasis color; it stays quiet
by role. Use emphasis consistently by role.

### 4. Use spacing to reveal structure without wasting space

Give adjacent text roles at least 4px of separation and give distinct sections a clear
gap. Combine related, compact metadata instead of letting one small marker consume an
entire row. Group controls that affect the same content, including search and filtering,
and place the primary action at the opposite end where width permits. A compact heading
may share one row with its adjacent local tools, justified to opposite ends when width
allows; a search entry keeps a conventional input width instead of stretching to fill the
available row. Judge row sharing
by group complexity, label length, field count, and available width, for filter groups
and multi-field forms alike: short controls such as search and simple chips may stay
compact on one row, while a complex multi-option group or a field-heavy form spreads onto
its own rows when available width would crowd fields or blur their labels; do not force
every group onto a separate row merely because it contains several options, and keep
fields on one row only when each retains adequate width and a clear label. Separate
repeated editable form rows by at least one text-line of vertical spacing so entries read
as distinct; this row gap does not justify enlarging the controls themselves. Wrap coherently on narrow screens. Favor spaced,
rounded cards over compressed divider rows for contained lists; keep the internal
controls compact rather than inflating every layer. Card internal padding should frame
the core title comfortably above and below, and the gap between cards and card groups
should match that generosity rather than tightening once the cards open; loose inside
and loose outside read as one system.

### 5. Build predictable alignment and placement

Use shared alignment rails and content measures for related headings, navigation, and
content. On wide screens, bound interactive content to a comfortable max-measure rather
than stretching edge-to-edge; tools and filters above the content share the same width
rail and max-measure so they do not break out past the content below. Arrange each repeated item on an intentional grid; keep auxiliary details in
stable positions rather than allowing arbitrary wrapping. By role, let the primary label
stand on its own line and keep primary content prominent, while related secondary
metadata shares a quieter alignment track beneath it; secondary metadata does not take
an emphasized column merely for being split off. When a fact does get its own column,
that separation requires it to carry its own clear information priority for the layout,
and then its size and weight agree with that role rather than isolating one column apart;
in an otherwise uniform row or table, keep text roles consistent across columns instead
of over-promoting a single column to a large, bold treatment. Apply this role split
wherever items repeat, not only in reference lists. Repeated form rows follow the same alignment model, with
single-line labels and controls vertically centered; put the label on the left rail and
the control on the right rail, justified across the row, and let controls of differing
widths together with the footer action buttons share one common right alignment line. When an action opens an editing
surface, keep it anchored to its trigger in the natural flow with a clear path from
trigger to surface; do not interleave unrelated controls between them. Place drag
affordances at the top of the draggable element, where the conventional mental model
expects them, rather than anchoring a handle to the bottom edge; affordance placement
follows convention and natural flow, not a chosen structure. Center side actions within the full item they
operate on. Put appearance controls at the page header's right side. Preserve
relationships across responsive layouts.

### 6. Use a coherent system for shape and separation

Use one consistent corner shape for interactive controls of the same role everywhere
they appear — fields, buttons, toolbars, dialogs, items, and list-row actions share one
corner treatment; location alone does not justify a different button shape.
Non-interactive small badges and tags may instead use full-round pills; metadata does
not need a container just because it has a category. Preserve semantically required
control structures, such as a switch's track and thumb, rather than flattening distinct
control types into one generic shape. Let container chrome follow role and grouping
purpose: discrete content units may be separated with a rounded card, while controls
that operate on content elsewhere inherit the region's surface instead of receiving an
independent card border or padding; give a control its own container only when a
distinct scope or grouping requires it. Do not nest a content card inside another: if
the items in a region are already carded, let the grouping region share the page surface
instead of wrapping them in a second card. Independent panels have complete corners;
join edges only when the surfaces are truly one component. Leave a gap between
independent controls and the content they govern. When two regions sit directly adjacent
with nothing between them, give one separation signal rather than two rules enclosing
empty space: do not stack a bottom rule on the upper region and a top rule on the lower;
a single reasonable divider may still sit within comfortable whitespace. Borders and
dividers follow an actual grouping or boundary need, not the shape of a header, and are
not wrapped around every group, control, or layer merely for structural completeness; a
complex interactive operation area gets a separation signal only when a real boundary
justifies one, never automatically because it sits at the top of the page. Within a
content unit, do not draw an internal divider between the content and the actions
attached to it just to declare a separate action zone; attached actions share the
unit's surface unless a genuine scope boundary separates them.
Prefer flat,
coherent separation; avoid unnecessary combinations of borders, background changes, and
shadows, or an isolated outline around an otherwise integrated action area.

### 7. Give a meaning one sufficient, consistent signal

Do not display the same value or semantic marker twice within the same scope; when an
always-visible stateful control already renders its state, a separate badge for that same
state is the second signal and goes. Reuse the
same icon and state treatment for the same meaning, and distinguish unrelated meanings.
A given marker shape carries exactly one semantic role in a product; do not stamp the
same badge onto a structurally parallel entry that does not carry that role merely to
keep rows visually consistent. If an entry has no warrant for the badge's meaning, it
has no badge — leaving it plain is correct, not a layout defect to be patched with a
decorative one. Let secondary metadata remain plain text unless a marker adds useful recognition. Keep
a coherent palette across active surface styles: the primary action and the selected state
both draw from the same theme accent, rather than coloring one a neutral black and the
other the theme color, while error, disabled, and other semantic states keep their own
distinctions. Prefer
one background change for selection in navigation and comparable choice lists; do not
add a colored single-edge border to a rounded item or panel as an emphasis shortcut.
This user's preference is for an integrated selected surface, not an ornamental stripe
that follows the corner curve. Keep a necessary keyboard-focus indicator distinct from
selection. When a selected or active element colors its text with the theme accent, the
icons bound inside that element follow the same coloring — bind them to the same
currentColor or token rather than leaving them a neutral gray; an outline on colored text
must use exactly the same color and opacity as the text, again through one token or
currentColor. A visual marker is not a substitute
for accessible semantics. Different scopes may legitimately need distinct, clearly
placed totals.

### 8. Keep visible controls compact and usable

Use vertical padding around one-third to one-half of horizontal padding as a compactness
reference. Keep an adequately sized icon inside a restrained visible control, rather
than enlarging its fill to compete with core content. Stateful controls must render
their bound value: a switch's thumb position and track must match the actual on or off
state. Check the bound value before treating a rendering as a defect; do not assume a
specific visual cause that the evidence does not support. Preserve a usable touch target,
including 44px targets where needed; any transparent extension must not overlap nearby
controls or steal input. An isolated input keeps a compact visible box around its text,
roughly one line tall rather than a double-height pill, while retaining generous external
spacing; reach the 44px touch target through a transparent extension, not by inflating the
visible field. Visual consistency does not mean identical dimensions for
semantically different components.

### 9. Choose fonts for their role, not for isolated characters

Use a readable proportional UI font for navigation, controls, counts, and ordinary
numeric information. Reserve monospace for code or genuine character-alignment tasks,
not merely because content contains digits. A serif content font can support a book-like
experience without propagating into the interface. Maintain readable line lengths and
contrast; related content stays on a shared measure with spacing, not arbitrary offsets.

### 10. Prefer direct recognition over repetitive labels

Prefer familiar icons for simple actions, while retaining words for genuinely ambiguous
ones. A conventional action whose established icon already carries the meaning needs no
word label beside it. Prefer established open-source icon sets such as Lucide; inline a properly
licensed SVG path copied from them rather than hand-drawing a familiar glyph, and do
not add an icon-library dependency for a single mark. Keep a visible search entry and a
recognizable search icon. A control's conventional appearance must match its actual
behavior: the way a control looks must be the way it works, so a control shaped for one
function must not stand in for a different one. Use the same semantic icon for an
item-level action and a matching aggregate entry when they represent the same concept.
An aggregate count may share the filter or view entry only when concept and scope match.
Provide accessible names, selected or pressed semantics,
visible focus, and
meaningful feedback. Hover or focus hints may clarify icons, but cannot be the only path
to understanding or operating an action. Dragging needs usable alternatives.

### 11. Make choices and movement explain themselves consistently

Preview visual choices directly instead of describing their effects in extra visible
captions. An appearance option previews the visual property it changes — a color choice
shows color, a typographic choice shows type, a layout or spacing choice shows the
relevant structure — rather than restating the choice in words; once a preview shows
the option, the word label next to it goes. Use a coherent lightweight preview-and-selected-ring treatment across related
appearance groups, without routine permanent outlines or changing the preview's font
weight to indicate selection. Preserve option identity and accessibility. Pick the
choice control to match the complexity of the options it presents. A compact segmented
control suits a short, uniform set of textual or icon-only options. When options carry
rich structural previews or compound content that needs room of its own, let the choice
semantics stand in a control whose native form accommodates that content independently,
rather than compressing heterogeneous option types into one segmented strip. For reversible
single-choice filters, clicking the selected option clears it and no selection means all,
so a separate "All" control is unnecessary. Plan sticky behavior as a coherent sequence:
keep related regions in their natural order, avoid isolated anchors and unexpected
movement, and never obscure content or fix layers without a useful purpose.

## Applying the principles

- Preserve business content and working functions when refining an existing page.
