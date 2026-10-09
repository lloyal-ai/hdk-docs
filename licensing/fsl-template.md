# FSL-1.1-MIT canonical template

This is the FSL-1.1-MIT license text used for new versions of the Lloyal runtime.
Lloyal's additional application-building permissions live in the separate
[Developer Grant](https://github.com/lloyal-ai/hdk/blob/d9112692d592f73e3922d096a4cdf2edcc889089/GRANT.md).

## Parameters

| Marker | Value at instantiation |
|---|---|
| `\<Year>` | The applicable copyright year |
| `\<Licensor>` | The party offering the Software (`Lloyal Labs`) |

## Template

> Copy the license between the dividers into the repo's `LICENSE` file and
> substitute the copyright notice parameters above. Do not modify the operative text.

---

# Functional Source License, Version 1.1, MIT Future License

## Abbreviation

FSL-1.1-MIT

## Notice

Copyright \<Year> \<Licensor>

## Terms and Conditions

### Licensor ("We")

The party offering the Software under these Terms and Conditions.

### The Software

The "Software" is each version of the software that we make available under
these Terms and Conditions, as indicated by our inclusion of these Terms and
Conditions with the Software.

### License Grant

Subject to your compliance with this License Grant and the Patents,
Redistribution and Trademark clauses below, we hereby grant you the right to
use, copy, modify, create derivative works, publicly perform, publicly display
and redistribute the Software for any Permitted Purpose identified below.

### Permitted Purpose

A Permitted Purpose is any purpose other than a Competing Use. A Competing Use
means making the Software available to others in a commercial product or
service that:

1. substitutes for the Software;

2. substitutes for any other product or service we offer using the Software
   that exists as of the date we make the Software available; or

3. offers the same or substantially similar functionality as the Software.

Permitted Purposes specifically include using the Software:

1. for your internal use and access;

2. for non-commercial education;

3. for non-commercial research; and

4. in connection with professional services that you provide to a licensee
   using the Software in accordance with these Terms and Conditions.

### Patents

To the extent your use for a Permitted Purpose would necessarily infringe our
patents, the license grant above includes a license under our patents. If you
make a claim against any party that the Software infringes or contributes to
the infringement of any patent, then your patent license to the Software ends
immediately.

### Redistribution

The Terms and Conditions apply to all copies, modifications and derivatives of
the Software.

If you redistribute any copies, modifications or derivatives of the Software,
you must include a copy of or a link to these Terms and Conditions and not
remove any copyright notices provided in or with the Software.

### Disclaimer

THE SOFTWARE IS PROVIDED "AS IS" AND WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF FITNESS FOR A PARTICULAR
PURPOSE, MERCHANTABILITY, TITLE OR NON-INFRINGEMENT.

IN NO EVENT WILL WE HAVE ANY LIABILITY TO YOU ARISING OUT OF OR RELATED TO THE
SOFTWARE, INCLUDING INDIRECT, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES,
EVEN IF WE HAVE BEEN INFORMED OF THEIR POSSIBILITY IN ADVANCE.

### Trademarks

Except for displaying the License Details and identifying us as the origin of
the Software, you have no right under these Terms and Conditions to use our
trademarks, trade names, service marks or product names.

## Grant of Future License

We hereby irrevocably grant you an additional license to use the Software under
the MIT license that is effective on the second anniversary of the date we make
the Software available. On or after that date, you may use the Software under
the MIT license, in which case the following will apply:

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Notes for repo maintainers

- **Conversion date:** Each version carrying FSL-1.1-MIT becomes available under
  MIT on the second anniversary of the date it is first made available. There
  is no `\<Change Date>`, `\<Software>` or Effective Date placeholder in this
  template. A copyright year is not a version's release date.
- **Per-version history:** Keep release history identifying when each version
  was first made available. The same unmodified license text can accompany
  successive versions; each version has its own two-year clock.
- **Earlier versions:** Versions already published under FSL-1.1-Apache-2.0
  retain their existing license, irrevocable future Apache 2.0 rights,
  original conversion dates and grant permissions. Do not replace old release
  artifacts or retag them to apply this migration retroactively.
- **MIT conversion:** The additional license is irrevocable and takes effect
  automatically. Lloyal Labs need not change the published artifact when that
  anniversary arrives.
- **Additional permissions:** Include `GRANT.md` alongside `LICENSE`. HDK's
  `GRANT.md` is the canonical grant and `licensing/faq.md` in this docs repository
  is the canonical FAQ. Use HDK's `scripts/sync-license-faq.sh` to update copies
  and its `--check` mode to detect drift. See HDK's `scripts/LICENSING.md` for the
  complete synchronization and release workflow.
- **Source:** The standard FSL text is published at
  https://github.com/getsentry/fsl.software/blob/main/FSL-1.1-MIT.template.md.
  Lloyal's grant supplements it without modifying the operative text. See the
  [Licensing FAQ](https://docs.lloyal.ai/licensing/faq).
