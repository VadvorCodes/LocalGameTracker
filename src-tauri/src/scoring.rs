use crate::models::CategoryWeights;

/// Weighted overall score from category scores.
///
/// - Each category is 0..=100 and optional.
/// - Only filled categories contribute; their weights are renormalized so a
///   partially-scored game still yields a fair 0..=100 result.
/// - Returns None when no category is filled.
pub fn compute_overall(
    gameplay: Option<i64>,
    story: Option<i64>,
    music: Option<i64>,
    technical: Option<i64>,
    weights: &CategoryWeights,
) -> Option<f64> {
    let pairs = [
        (gameplay, weights.gameplay),
        (story, weights.story),
        (music, weights.music),
        (technical, weights.technical),
    ];
    let filled: Vec<(i64, f64)> = pairs
        .iter()
        .filter_map(|(s, w)| s.map(|v| (v, *w)))
        .collect();
    if filled.is_empty() {
        return None;
    }
    let total_weight: f64 = filled.iter().map(|(_, w)| *w).sum();
    if total_weight <= 0.0 {
        // Degenerate weights: fall back to plain mean.
        let n = filled.len() as f64;
        let sum: f64 = filled.iter().map(|(s, _)| *s as f64).sum();
        return Some((sum / n * 10.0).round() / 10.0);
    }
    let weighted: f64 = filled
        .iter()
        .map(|(s, w)| (*s as f64) * w / total_weight)
        .sum();
    Some((weighted * 10.0).round() / 10.0) // one decimal
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w() -> CategoryWeights {
        CategoryWeights::default()
    }

    #[test]
    fn empty_returns_none() {
        assert!(compute_overall(None, None, None, None, &w()).is_none());
    }

    #[test]
    fn equal_weights_full() {
        assert_eq!(
            compute_overall(Some(80), Some(60), Some(40), Some(100), &w()),
            Some(70.0)
        );
    }

    #[test]
    fn partial_renormalizes() {
        // Only gameplay=80 filled: weight renormalizes to 100% -> 80.
        assert_eq!(
            compute_overall(Some(80), None, None, None, &w()),
            Some(80.0)
        );
        // gameplay=80, music=40 with equal weights -> mean 60.
        assert_eq!(
            compute_overall(Some(80), None, Some(40), None, &w()),
            Some(60.0)
        );
    }

    #[test]
    fn custom_weights() {
        let w = CategoryWeights {
            gameplay: 40.0,
            story: 25.0,
            music: 15.0,
            technical: 20.0,
        };
        // 100*0.4 + 0*0.25 + 100*0.15 + 0*0.2 = 55
        assert_eq!(
            compute_overall(Some(100), Some(0), Some(100), Some(0), &w),
            Some(55.0)
        );
    }

    #[test]
    fn clamps_not_needed_but_rounds() {
        let w = CategoryWeights {
            gameplay: 1.0,
            story: 1.0,
            music: 1.0,
            technical: 0.0,
        };
        // 33+33+34=100 -> 100*1/3 each -> 33.3+33.3+33.4? compute: (33+33+34)/3 = 33.333 -> 33.3
        assert_eq!(
            compute_overall(Some(33), Some(33), Some(34), None, &w),
            Some(33.3)
        );
    }
}
