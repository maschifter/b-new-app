import { progressAnnouncementMilestone } from "../score-reveal";

describe("progressAnnouncementMilestone", () => {
  it("announces only crossed ten-percent milestones and the terminal hold", () => {
    expect(progressAnnouncementMilestone(5, 9)).toBeNull();
    expect(progressAnnouncementMilestone(5, 10)).toBe(10);
    expect(progressAnnouncementMilestone(10, 49)).toBe(40);
    expect(progressAnnouncementMilestone(90, 95)).toBe(95);
  });

  it("starts a retried scan from the initial announcement state", () => {
    expect(progressAnnouncementMilestone(0, 5)).toBeNull();
    expect(progressAnnouncementMilestone(5, 10)).toBe(10);
  });
});
