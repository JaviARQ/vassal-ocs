import { describe, expect, it } from "vitest";
import { Labeler, htmlLabelToText } from "../src/model/traits/Labeler";

describe("Labeler HTML labels", () => {
  it("converts Swing-style <html> labels to plain lines", () => {
    expect(htmlLabelToText('<HTML><DIV style="width:100px">Anytown, Province<br>1 May 1901</DIV></HTML>'))
      .toBe("Anytown, Province\n1 May 1901");
    expect(htmlLabelToText("<html><center><font size=5>S&amp;S <b>Rules</b> &lt;beta&gt;</font></center></html>"))
      .toBe("S&S Rules <beta>");
  });

  it("labelText converts only <html>-prefixed labels", () => {
    const plain = new Labeler("label;76,130;Label");
    plain.setState("Kill Zone <1>");
    expect(plain.labelText()).toBe("Kill Zone <1>");

    const html = new Labeler("label;76,130;Label");
    html.setState("<html>a<br>b</html>");
    expect(html.labelText()).toBe("a\nb");
    // The raw state is untouched (property substitution / save round-trip).
    expect(html.getState()).toBe("<html>a<br>b</html>");
    expect(html.getProperty("LabelText")).toBe("<html>a<br>b</html>");
  });
});
