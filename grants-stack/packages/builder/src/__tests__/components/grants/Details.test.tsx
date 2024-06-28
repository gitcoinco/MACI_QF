import "@testing-library/jest-dom";
import { act, cleanup, screen } from "@testing-library/react";
import Details from "../../../components/grants/Details";
import setupStore from "../../../store";
import { renderWrapped, buildProjectMetadata } from "../../../utils/test_utils";

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useParams: () => ({
    chainId: "1",
    id: "2",
  }),
}));

describe("<Details />", () => {
  afterEach(() => {
    cleanup();
  });

  describe("project description", () => {
    it("should render a markdown description", async () => {
      const store = setupStore();
      const project = buildProjectMetadata({
        description: `
# this should be an h1
## this should be an h2
### this should be an h3

![image description](http://example.com/image.png)

[link description](http://example.com)

**bold text**
_italic text_

<script>alert("this should be rendered as text")</script>
`,
      });

      await act(async () => {
        renderWrapped(
          <Details
            project={project}
            createdAt={new Date().getTime()}
            updatedAt={new Date().getTime()}
            bannerImg="img"
            logoImg="img"
            showApplications={false}
            showTabs
          />,
          store
        );
      });

      expect(screen.getByText("this should be an h1").tagName).toBe("H1");
      expect(screen.getByText("this should be an h2").tagName).toBe("H2");
      expect(screen.getByText("this should be an h3").tagName).toBe("H3");
      expect(screen.getByText("bold text").tagName).toBe("STRONG");
      expect(screen.getByText("italic text").tagName).toBe("EM");
      expect(
        screen.getByText(
          `<script>alert("this should be rendered as text")</script>`
        ).tagName
      ).toBe("P");
    });
  });
});
