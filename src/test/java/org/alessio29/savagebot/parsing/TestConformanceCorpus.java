package org.alessio29.savagebot.parsing;

import org.junit.Assert;
import org.junit.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * Replays the conformance corpus against the live engine.
 *
 * <p>Two jobs. On the Java side it is a broad regression net over the whole expression language --
 * far wider than the hand-written goldens, and it fails loudly if any roll's value or explanation
 * drifts. For the TypeScript port it is the oracle: the same file, replayed by the TS engine with
 * a faithful {@code java.util.Random} reimplementation, must match byte for byte.
 *
 * <p>Regenerate with {@link ConformanceCorpus#main} after an intentional behaviour change, and
 * review the diff -- do not regenerate to make a failure disappear.
 */
public class TestConformanceCorpus {

    private static final String CORPUS = "src/test/resources/conformance-corpus.tsv";

    @Test
    public void corpusReplaysIdentically() throws IOException {
        List<String[]> records = ConformanceCorpus.load(CORPUS);
        Assert.assertFalse("corpus is empty -- was it generated?", records.isEmpty());

        List<String> mismatches = new ArrayList<>();
        for (String[] record : records) {
            long seed = Long.parseLong(record[0]);
            String expression = record[1];
            String expected = record[2];
            String actual;
            try {
                actual = escape(ConformanceCorpus.evaluate(expression, seed));
            } catch (Exception e) {
                actual = "<<ERROR>> " + e.getClass().getSimpleName() + ": " + e.getMessage();
            }
            if (!expected.equals(actual)) {
                mismatches.add("seed=" + seed + " expr=" + expression
                        + "\n  expected: " + expected
                        + "\n  actual  : " + actual);
            }
        }
        if (!mismatches.isEmpty()) {
            Assert.fail(mismatches.size() + " of " + records.size()
                    + " corpus records changed:\n" + String.join("\n", mismatches));
        }
    }

    /** The corpus is only meaningful if it is actually exercising the grammar. */
    @Test
    public void corpusIsSubstantialAndParses() throws IOException {
        List<String[]> records = ConformanceCorpus.load(CORPUS);
        Assert.assertTrue("expected a few hundred records, got " + records.size(),
                records.size() >= 300);
        for (String[] record : records) {
            Assert.assertFalse(
                    "corpus contains an evaluation error for " + record[1],
                    record[2].contains("<<ERROR>>"));
            Assert.assertFalse(
                    "corpus contains a parse failure for " + record[1],
                    record[2].contains("token recognition error"));
        }
    }

    /** Guards the file being present in the build, not just on someone's disk. */
    @Test
    public void corpusFileExists() {
        Assert.assertTrue(CORPUS + " is missing", Files.exists(Paths.get(CORPUS)));
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }
}
