-- ── Import resources from 'PD and Resource Lists' Google Doc ────────
-- One-time data import. Safe to re-run: each row is guarded by a
-- NOT EXISTS check on url, so re-running inserts nothing new.
-- submitted_by = null, is_approved = true (visible immediately).
-- 48 web resources (category-tagged) + 17 internal curated lists.

begin;

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Bard Institute for Writing and Thinking. (n.d.). Bard IWT.', 'https://iwt.bard.edu/', 'website', array['Teaching Lessons']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://iwt.bard.edu/');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Carleton College. (n.d.). AI-Resistant Assignments. Writing Across the Curriculum.', 'https://www.carleton.edu/writing/resources-for-faculty/working-with-ai/ai-resistant-assignments/', 'website', array['Teaching Lessons']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.carleton.edu/writing/resources-for-faculty/working-with-ai/ai-resistant-assignments/');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'DePaul University. (n.d.). In-Class Writing. Teaching Commons.', 'https://resources.depaul.edu/teaching-commons/teaching-guides/learning-activities/Pages/in-class-writing.aspx', 'website', array['Teaching Lessons']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://resources.depaul.edu/teaching-commons/teaching-guides/learning-activities/Pages/in-class-writing.aspx');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Edutopia. (n.d.). Using AI Tools to Give Feedback on High School Students’ Writing.', 'https://www.edutopia.org/article/ai-writing-feedback-students/', 'article', array['Teaching Lessons']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.edutopia.org/article/ai-writing-feedback-students/');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'GLSEN. (n.d.). Unheard Voices: Stories of LGBTQ History.', 'http://glsen.org/unheardvoices.html', 'website', array['Teaching Lessons']::text[], true, null
where not exists (select 1 from public.resources where url = 'http://glsen.org/unheardvoices.html');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Ladson-Billings, G. (2014). Culturally relevant pedagogy 2.0: aka the remix. Harvard Educational Review, 84(1), 74–84.', 'https://drive.google.com/file/d/1p5l4QBsf_3fMD2gNsuCvJzfD0-elpc5t/view?usp=sharing', 'pdf', array['Teaching Lessons']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://drive.google.com/file/d/1p5l4QBsf_3fMD2gNsuCvJzfD0-elpc5t/view?usp=sharing');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Northern Michigan University. (n.d.). Creating AI-Resistant Assignments, Activities, and Assessments. Center for Teaching and Learning.', 'https://nmu.edu/ctl/creating-ai-resistant-assignments-activities-and-assessments-designing-out/', 'website', array['Teaching Lessons']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://nmu.edu/ctl/creating-ai-resistant-assignments-activities-and-assessments-designing-out/');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Teachers College, Columbia University. (n.d.). AI for the K-12 Classroom. TC Academy.', 'https://www.tc.columbia.edu/tcacademy/programs/all-offerings/ai-for-the-k-12-classroom/', 'website', array['Teaching Lessons']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.tc.columbia.edu/tcacademy/programs/all-offerings/ai-for-the-k-12-classroom/');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Tomlinson, C. A. (2014). The Differentiated Classroom: Responding to the Needs of All Learners (2nd ed., Chapters 4 & 5). ASCD.', 'https://drive.google.com/file/d/13CQYqdhqeNbMZVv72ARdm7WxZ8JpZnhe/view?usp=drive_link', 'pdf', array['Teaching Lessons']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://drive.google.com/file/d/13CQYqdhqeNbMZVv72ARdm7WxZ8JpZnhe/view?usp=drive_link');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'University of Pennsylvania. (n.d.). Five Ways to Design Assignments for the AI Era. GSE.', 'https://www.gse.upenn.edu/news/five-ways-design-assignments-ai-era', 'website', array['Teaching Lessons']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.gse.upenn.edu/news/five-ways-design-assignments-ai-era');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Wiggins, G., & McTighe, J. (2005). Understanding by Design (Expanded 2nd ed., Chapter 1: Backwards Design). ASCD.', 'https://andymatuschak.org/files/papers/Wiggins,%20McTighe%20-%202005%20-%20Understanding%20by%20design.pdf', 'website', array['Teaching Lessons']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://andymatuschak.org/files/papers/Wiggins,%20McTighe%20-%202005%20-%20Understanding%20by%20design.pdf');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Academy for Academic Leadership. (n.d.). Course Curriculum Mapping.', 'https://www.academicleaders.org/course-curriculum-mapping', 'website', array['Designing Courses']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.academicleaders.org/course-curriculum-mapping');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'McTighe, J., & Willis, J. (2019). Understanding by design meets neuroscience (pp. 3–28). ASCD.', 'https://drive.google.com/file/d/1egve2VqLA2vjulgLAijVDOXNmP0L02LE/view?usp=sharing', 'pdf', array['Designing Courses']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://drive.google.com/file/d/1egve2VqLA2vjulgLAijVDOXNmP0L02LE/view?usp=sharing');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Ackerman Institute. (n.d.). Gender and Family Project.', 'https://www.ackerman.org/research/gfp/', 'website', array['Building Relationships']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.ackerman.org/research/gfp/');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Bowler, K. (n.d.). Joyful Anyway.', 'https://www.amazon.com/Joyful-Anyway-Kate-Bowler/dp/B0FGZZ4W77', 'book', array['Building Relationships']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/Joyful-Anyway-Kate-Bowler/dp/B0FGZZ4W77');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Chödrön, P. (n.d.). The Places That Scare You. Pema Chödrön Foundation.', 'https://pemachodronfoundation.org/product/the-places-that-scare-you/', 'website', array['Building Relationships']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://pemachodronfoundation.org/product/the-places-that-scare-you/');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Desmond, M. (2023). Poverty, By America. Crown.', 'https://www.amazon.com/Poverty-America-Matthew-Desmond-ebook/dp/B0B4R1J4R5', 'book', array['Building Relationships']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/Poverty-America-Matthew-Desmond-ebook/dp/B0B4R1J4R5');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Facing History & Ourselves. (n.d.). Contracting for Back to School.', 'https://www.facinghistory.org/resource-library/contracting-back-school', 'website', array['Building Relationships']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.facinghistory.org/resource-library/contracting-back-school');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Facing History & Ourselves. (n.d.). Starting the School Year with Community and Connection.', 'https://www.facinghistory.org/learning-events/starting-school-year-community-connection-2026-webinar', 'website', array['Building Relationships']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.facinghistory.org/learning-events/starting-school-year-community-connection-2026-webinar');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Gender Spectrum. (n.d.). Language of Gender.', 'https://genderspectrum.org/articles/language-of-gender', 'website', array['Building Relationships']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://genderspectrum.org/articles/language-of-gender');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Hammond, Z. (2015). Culturally Responsive Teaching and The Brain: Promoting Authentic Engagement and Rigor Among Culturally and Linguistically Diverse Students (Chapter 5). Corwin.', 'https://drive.google.com/file/d/11PshUvu8sP0h_A5yciTFpZXWdh0YLoI6/view?usp=sharing', 'pdf', array['Building Relationships']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://drive.google.com/file/d/11PshUvu8sP0h_A5yciTFpZXWdh0YLoI6/view?usp=sharing');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Jansson, T. (n.d.). Tales from Moomin Valley.', 'https://www.amazon.com/dp/0312625421/', 'book', array['Building Relationships']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/dp/0312625421/');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'NPR. (2020). 4 Ways to make your workplace equitable for trans people.', 'https://www.npr.org/2020/06/02/867780063/4-ways-to-make-your-workplace-equitable-for-trans-people', 'article', array['Building Relationships','Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.npr.org/2020/06/02/867780063/4-ways-to-make-your-workplace-equitable-for-trans-people');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'PFLAG. (n.d.). Pronoun Guide.', 'https://pflag.org/search?keys=Pronoun%20guide', 'website', array['Building Relationships','Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://pflag.org/search?keys=Pronoun%20guide');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Reeves, R. V. (n.d.). Of Boys and Men. Brookings Institution Press.', 'https://www.brookings.edu/books/of-boys-and-men/', 'website', array['Building Relationships','Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.brookings.edu/books/of-boys-and-men/');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Tough, P. (2025). Have we been thinking about A.D.H.D. all wrong? The New York Times Magazine.', 'https://www.nytimes.com/2025/04/13/magazine/adhd-medication-treatment-research.html', 'article', array['Building Relationships']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.nytimes.com/2025/04/13/magazine/adhd-medication-treatment-research.html');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Vuong, O. (2019). On Earth We''re Briefly Gorgeous. Penguin Press.', 'https://www.goodreads.com/book/show/41880609-on-earth-we-re-briefly-gorgeous', 'book', array['Building Relationships','Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.goodreads.com/book/show/41880609-on-earth-we-re-briefly-gorgeous');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Academy for Academic Leadership. (n.d.). Assessing Assessments in the Age of AI.', 'https://www.academicleaders.org/course-assessing-assessments-ai', 'website', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.academicleaders.org/course-assessing-assessments-ai');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Academy for Academic Leadership. (n.d.). The Emotional Lives of Teenagers.', 'https://www.academicleaders.org/the-emotional-lives-of-teenagers', 'website', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.academicleaders.org/the-emotional-lives-of-teenagers');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Chen, M., & Rybak, C. J. (n.d.). Group Leadership Skills.', 'https://www.amazon.com/s/ref=dp_byline_sr_book_1?ie=UTF8&field-author=Mei-whei+Chen&text=Mei-whei+Chen&sort=relevancerank&search-alias=books', 'book', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/s/ref=dp_byline_sr_book_1?ie=UTF8&field-author=Mei-whei+Chen&text=Mei-whei+Chen&sort=relevancerank&search-alias=books');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Connors, N. (n.d.). If You Don’t Feed the Teachers They Eat the Students.', 'https://www.amazon.com/If-You-Dont-Feed-Teachers/dp/193055655X', 'book', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/If-You-Dont-Feed-Teachers/dp/193055655X');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Crescendo Ed Group. (n.d.). Beyond Points: Reimagining Homework for Authentic Learning in the AI Era.', 'https://crescendoedgroup.org/blog/homework/beyond-points-reimagining-homework-for-authentic-learning-in-the-ai-era/', 'website', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://crescendoedgroup.org/blog/homework/beyond-points-reimagining-homework-for-authentic-learning-in-the-ai-era/');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Crowley, K., & Elster, K. (n.d.). Working with You is Killing Me.', 'https://www.amazon.com/Katherine-Crowley/e/B001IOFGJC', 'book', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/Katherine-Crowley/e/B001IOFGJC');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Donaldson, G. (n.d.). Cultivating Leadership in Schools.', 'https://www.amazon.com/Cultivating-Leadership-Schools-Gordon-Donaldson/dp/0807746592', 'book', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/Cultivating-Leadership-Schools-Gordon-Donaldson/dp/0807746592');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Kegan, R., & Lahey, L. L. (2016). An Everyone Culture: Becoming a Deliberately Developmental Organization. Harvard Business Review Press.', 'https://www.amazon.com/Everyone-Culture-Becoming-Deliberately-Developmental/dp/162527863X', 'book', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/Everyone-Culture-Becoming-Deliberately-Developmental/dp/162527863X');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Minchin, K. (n.d.). Always Time for Coffee.', 'https://www.amazon.com/Always-Time-Coffee-Kate-Minchin/dp/1499596560', 'book', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/Always-Time-Coffee-Kate-Minchin/dp/1499596560');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Patterson, K., & Switzler, R. (n.d.). Crucial Accountability.', 'https://www.amazon.com/Crucial-Accountability-Tools-Resolving-Broken/dp/0071829318', 'book', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/Crucial-Accountability-Tools-Resolving-Broken/dp/0071829318');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Stone, D., Patton, B., & Heen, S. (2010). Difficult Conversations: How to Discuss What Matters Most. Viking.', 'https://www.amazon.com/Difficult-Conversations-Discuss-What-Matters/dp/0143118447', 'book', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/Difficult-Conversations-Discuss-What-Matters/dp/0143118447');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Sullivan, S. S., & Glanz, J. G. (n.d.). Supervision that Improves Teaching and Learning.', 'https://www.powells.com/book/supervision-that-improves-teaching-and-learning-9781452255460', 'book', array['Academic Leadership']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.powells.com/book/supervision-that-improves-teaching-and-learning-9781452255460');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Harvard Health. (2021). Misgendering: What it is and why it matters.', 'https://www.health.harvard.edu/blog/misgendering-what-it-is-and-why-it-matters-202107232553', 'article', array['Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.health.harvard.edu/blog/misgendering-what-it-is-and-why-it-matters-202107232553');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Immordino-Yang, M. H., Christodoulou, J., & Singh, V. (2012). Rest is not idleness: Implications of the brain''s default mode for human development and education. Perspectives on Psychological Science, 7(4), 352–364.', 'https://drive.google.com/file/d/1BBSKsLOyv-XuK_zZ6HSZL-5V_1vEI3Bk/view?usp=sharing', 'pdf', array['Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://drive.google.com/file/d/1BBSKsLOyv-XuK_zZ6HSZL-5V_1vEI3Bk/view?usp=sharing');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Kagge, E. (2017). Silence in the Age of Noise. Pantheon.', 'https://www.amazon.com/Silence-Age-Noise-Erling-Kagge/dp/0525563644', 'book', array['Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/Silence-Age-Noise-Erling-Kagge/dp/0525563644');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Krumrei-Mancuso, E. J., Haggard, M. C., LaBouff, J. P., & Rowatt, W. C. (2020). Links between intellectual humility and acquiring knowledge. The Journal of Positive Psychology, 15(2), 155–170.', 'https://drive.google.com/file/d/1IFveRQCqORq9HT1_q_0zVSsttrCdTZHT/view?usp=sharing', 'pdf', array['Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://drive.google.com/file/d/1IFveRQCqORq9HT1_q_0zVSsttrCdTZHT/view?usp=sharing');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Learning for Justice. (n.d.). The Problem with Pronouns.', 'https://www.learningforjustice.org/magazine/the-problem-with-pronouns', 'website', array['Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.learningforjustice.org/magazine/the-problem-with-pronouns');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'National History Museum. (n.d.). Beyond Gender: Indigenous Perspectives (Muxe).', 'https://nhm.org/stories/beyond-gender-indigenous-perspectives-muxe', 'website', array['Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://nhm.org/stories/beyond-gender-indigenous-perspectives-muxe');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Pelt, S. (2022). Remarkably Bright Creatures. Ecco.', 'https://www.amazon.com/Remarkably-Bright-Creatures-Shelby-Pelt/dp/0063204150', 'book', array['Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.amazon.com/Remarkably-Bright-Creatures-Shelby-Pelt/dp/0063204150');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Scientific American. (n.d.). Stop using phony science to justify transphobia.', 'https://blogs.scientificamerican.com/voices/stop-using-phony-science-to-justify-transphobia/', 'article', array['Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://blogs.scientificamerican.com/voices/stop-using-phony-science-to-justify-transphobia/');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Tough, P. (2025). Have we been thinking about A.D.H.D. all wrong? The New York Times Magazine.', 'https://www.nytimes.com/2025/04/13/magazine/adhd-medication-treatment-research.html?unlocked_article_code=1.NE8.-a2j.hEJUBIlLyYvz&smid=url-share', 'article', array['Modeling Virtues']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://www.nytimes.com/2025/04/13/magazine/adhd-medication-treatment-research.html?unlocked_article_code=1.NE8.-a2j.hEJUBIlLyYvz&smid=url-share');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Targeted PD List based on End of Year Evaluations', 'https://docs.google.com/document/d/1dSsCHxnXHvSHuDdcjoGdNJWF8_KjYfDtAy0N_YZUKMA/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/1dSsCHxnXHvSHuDdcjoGdNJWF8_KjYfDtAy0N_YZUKMA/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Summer 2026 PD Reccs', 'https://docs.google.com/document/d/13badHD38LcjjkkEvQr1xf0I8pqf1DByJq2y3D7X5DLc/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/13badHD38LcjjkkEvQr1xf0I8pqf1DByJq2y3D7X5DLc/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Pronouns Playlist', 'https://sites.google.com/d/1-D0Q4ocyeSy9970AZx2G8q8etHPE5KC7/p/15z8QPW8cvUbIxaAM8tTQoMoOZkTXogoa/edit?pli=1', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://sites.google.com/d/1-D0Q4ocyeSy9970AZx2G8q8etHPE5KC7/p/15z8QPW8cvUbIxaAM8tTQoMoOZkTXogoa/edit?pli=1');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Resource List 2019', 'https://docs.google.com/document/d/17Ozlaxt99APsCIQmXSpDm_eUVAg0NSkynLUR8ZGdNxA/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/17Ozlaxt99APsCIQmXSpDm_eUVAg0NSkynLUR8ZGdNxA/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select '24-25 October PD Day for Department Chairs', 'https://docs.google.com/document/d/1Hgh7CPXcLFYQbC1VEmDfg2cTp8HglkaurOnj_9DEvmo/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/1Hgh7CPXcLFYQbC1VEmDfg2cTp8HglkaurOnj_9DEvmo/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Resources for Department Chair Professional Development', 'https://docs.google.com/document/d/1xY2XBPlhOXmFp_F53IyqvF5Xdg853F_DCTN-6jccQN0/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/1xY2XBPlhOXmFp_F53IyqvF5Xdg853F_DCTN-6jccQN0/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'MS Resource Notebook', 'https://notebook.google.com/notebook/6842c4bd-5bcc-441e-9c70-5db607e5a586', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://notebook.google.com/notebook/6842c4bd-5bcc-441e-9c70-5db607e5a586');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Backwards Design Notebook', 'https://notebook.google.com/notebook/671dfe00-dfe4-470f-9c5e-c362890434d5', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://notebook.google.com/notebook/671dfe00-dfe4-470f-9c5e-c362890434d5');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Brain Bites', 'https://sites.google.com/d/1HMIwZA27Kmu8boOjs-s37scZOQKuv4RG/p/11DzU3PnDmr6jaOJf-OVPsNI27EMmKV2N/edit', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://sites.google.com/d/1HMIwZA27Kmu8boOjs-s37scZOQKuv4RG/p/11DzU3PnDmr6jaOJf-OVPsNI27EMmKV2N/edit');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select '2026 Summer Community Read', 'https://docs.google.com/document/d/1_TWuMWKHEZfNuw775aSHmM6JzyqZKXw4ZUdc3jVi03Q/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/1_TWuMWKHEZfNuw775aSHmM6JzyqZKXw4ZUdc3jVi03Q/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Summer 2025 Professional Community Reading', 'https://docs.google.com/document/d/1Hzkjk1keu8uWYTb6fAnDUY6YZScNPCdbnnnlNBSWwj4/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/1Hzkjk1keu8uWYTb6fAnDUY6YZScNPCdbnnnlNBSWwj4/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Resources for Employees 2025', 'https://docs.google.com/document/d/1wjZwnApSRon-QTHyGRE39NLUOHHOFRKkR8E8_IknSxo/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/1wjZwnApSRon-QTHyGRE39NLUOHHOFRKkR8E8_IknSxo/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Grace Church School Resource Library', 'https://docs.google.com/document/d/176hfPvnbj4fkC2HB61A4pViMK3-Xj2FBJ7XuP4-RcZg/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/176hfPvnbj4fkC2HB61A4pViMK3-Xj2FBJ7XuP4-RcZg/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Professional Development Focused on AI', 'https://docs.google.com/document/d/1Nld-nvEeYMnc7k2JWBE18S-_fgkMd-JmnhvqgczDFLM/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/1Nld-nvEeYMnc7k2JWBE18S-_fgkMd-JmnhvqgczDFLM/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Resources about Classroom Attention and Behavior Management', 'https://docs.google.com/document/d/1I-xGquL_0RQKN2YQhMLa9stof_-q4VER_0YkFloR2FY/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/1I-xGquL_0RQKN2YQhMLa9stof_-q4VER_0YkFloR2FY/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'Science of Learning “Friday Mini Brain Minutes“', 'https://docs.google.com/document/d/1yjeyzRn3nIVX5GsTpnGRBTVjdwA_d8TqzcPWIZ04y-o/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/1yjeyzRn3nIVX5GsTpnGRBTVjdwA_d8TqzcPWIZ04y-o/edit?tab=t.0');

insert into public.resources (title, url, type, tags, is_approved, submitted_by)
select 'GTT Recommended Resources from Grace', 'https://docs.google.com/document/d/1WAkKQ4d-O2yfV5FGRTIX76Ug3JGx6Q2hpFz_pPknGjA/edit?tab=t.0', 'other', array['Grace Curated Lists']::text[], true, null
where not exists (select 1 from public.resources where url = 'https://docs.google.com/document/d/1WAkKQ4d-O2yfV5FGRTIX76Ug3JGx6Q2hpFz_pPknGjA/edit?tab=t.0');

commit;
