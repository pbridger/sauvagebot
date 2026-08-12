package org.alessio29.savagebot.parsing;

import org.alessio29.savagebot.r2.eval.IntResult;
import org.alessio29.savagebot.r2.eval.Roller;
import org.junit.Assert;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Property tests for the exploding ("acing") die explanation.
 *
 * <p>These guard a bug where {@code Roller.roll(facets, isOpenEnded)} accumulated every
 * individual die into a StringJoiner and then discarded it, returning the bare total as its
 * own explanation -- so a d4 that aced five times reported {@code 23} instead of
 * {@code 4+4+4+4+4+3}. The golden-string tests cannot catch a regression here on their own,
 * because regenerating them from actual output would simply re-bless whatever the code does.
 */
public class TestExplodingExplanation {

    private static final int[] DIE_SIZES = {2, 3, 4, 6, 8, 10, 12, 20, 100};

    /** The explanation must always sum to the reported value. */
    @Test
    public void explanationSumsToValue() {
        Roller roller = new Roller(new Random(12345));
        for (int facets : DIE_SIZES) {
            for (int i = 0; i < 2000; i++) {
                IntResult result = roller.roll(facets, true);
                Assert.assertEquals(
                        "d" + facets + " explanation must sum to its value: " + result.getExplained(),
                        result.getValue(),
                        sumOf(result.getExplained())
                );
            }
        }
    }

    /**
     * The acing invariant: an exploding die re-rolls only on its maximum face, so every addend
     * except the last must equal the die size, and the last must be strictly smaller.
     * {@code 6+6+6+4} is reachable on a d6; {@code 6+3+6+4} never is.
     */
    @Test
    public void explanationSatisfiesAcingInvariant() {
        Roller roller = new Roller(new Random(67890));
        for (int facets : DIE_SIZES) {
            for (int i = 0; i < 2000; i++) {
                String explained = roller.roll(facets, true).getExplained();
                List<Integer> parts = partsOf(explained);
                for (int j = 0; j < parts.size() - 1; j++) {
                    Assert.assertEquals(
                            "d" + facets + ": every addend but the last must be the max face: " + explained,
                            facets,
                            (int) parts.get(j)
                    );
                }
                int last = parts.get(parts.size() - 1);
                Assert.assertTrue(
                        "d" + facets + ": final addend " + last + " must be < " + facets + ": " + explained,
                        last < facets
                );
            }
        }
    }

    /** A non-exploding die is always a single number, never a breakdown. */
    @Test
    public void nonExplodingRollsHaveNoBreakdown() {
        Roller roller = new Roller(new Random(1));
        for (int facets : DIE_SIZES) {
            for (int i = 0; i < 500; i++) {
                String explained = roller.roll(facets, false).getExplained();
                Assert.assertFalse(
                        "non-exploding d" + facets + " must not produce a breakdown: " + explained,
                        explained.contains("+")
                );
            }
        }
    }

    /**
     * An exploding dN can never total an exact multiple of N: the total is always
     * {@code k*N + v} with {@code 1 <= v <= N-1}. Useful as a live sanity check on output --
     * a Savage Worlds trait die of 12 on a d4 would be impossible.
     */
    @Test
    public void explodingTotalIsNeverAMultipleOfDieSize() {
        Roller roller = new Roller(new Random(424242));
        for (int facets : DIE_SIZES) {
            if (facets == 1) continue;
            for (int i = 0; i < 2000; i++) {
                int value = roller.roll(facets, true).getValue();
                Assert.assertNotEquals(
                        "exploding d" + facets + " produced a multiple of " + facets + ": " + value,
                        0,
                        value % facets
                );
            }
        }
    }

    /** A d1 must terminate rather than exploding forever. */
    @Test
    public void singleFacedDieTerminates() {
        Roller roller = new Roller(new Random(7));
        IntResult result = roller.roll(1, true);
        Assert.assertEquals(1, result.getValue());
        Assert.assertEquals("1", result.getExplained());
    }

    /**
     * The Savage Worlds trait roll keeps the better of the trait die and the Wild Die, and its
     * explanation must show both, each with its own breakdown.
     */
    @Test
    public void savageWorldsRollShowsBothDiceWithBreakdowns() {
        Roller roller = new Roller(new Random(999));
        for (int i = 0; i < 2000; i++) {
            String explained = roller.rollSavageWorlds(1, 4, 6).getExplained();
            Assert.assertTrue("expected [trait; wWild], got: " + explained,
                    explained.startsWith("[") && explained.endsWith("]"));
            String[] halves = explained.substring(1, explained.length() - 1).split("; ");
            Assert.assertEquals("expected exactly two dice: " + explained, 2, halves.length);
            Assert.assertTrue("wild die must be marked with w: " + explained, halves[1].startsWith("w"));

            // Each half must be internally consistent with its own die size.
            assertAcing(halves[0], 4, explained);
            assertAcing(halves[1].substring(1), 6, explained);
        }
    }

    private static void assertAcing(String breakdown, int facets, String context) {
        List<Integer> parts = partsOf(breakdown);
        for (int i = 0; i < parts.size() - 1; i++) {
            Assert.assertEquals("d" + facets + " in " + context, facets, (int) parts.get(i));
        }
        Assert.assertTrue("d" + facets + " final addend in " + context,
                parts.get(parts.size() - 1) < facets);
    }

    private static List<Integer> partsOf(String explained) {
        List<Integer> parts = new ArrayList<>();
        for (String part : explained.split("\\+")) {
            parts.add(Integer.parseInt(part.trim()));
        }
        return parts;
    }

    private static int sumOf(String explained) {
        int total = 0;
        for (int part : partsOf(explained)) {
            total += part;
        }
        return total;
    }
}
