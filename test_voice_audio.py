import unittest
import numpy as np
from voice_audio import audio_segments

class SegmentsTest(unittest.TestCase):
    def test_two_minutes_are_covered_without_gaps_or_oversized_chunks(self):
        rate=16000
        samples=np.full(120*rate,0.1,dtype=np.float32)
        samples[18*rate:19*rate]=0
        parts=list(audio_segments(samples,rate))
        self.assertEqual(parts[0][0],0)
        self.assertEqual(parts[-1][1],len(samples))
        self.assertTrue(18*rate <= parts[0][1] <= 19*rate)
        self.assertTrue(all(0 < end-start <= 20*rate for start,end in parts))
        self.assertTrue(all(a[1]==b[0] for a,b in zip(parts,parts[1:])))
        self.assertEqual(sum(end-start for start,end in parts),len(samples))
    def test_empty_and_short_audio(self):
        self.assertEqual(list(audio_segments(np.zeros(0),16000)),[])
        self.assertEqual(list(audio_segments(np.zeros(1200),16000)),[(0,1200)])
if __name__=='__main__':unittest.main()
