export type ProfessionalNetworkTeamMember = Readonly<{
  id: string;
  name: string;
  group: string;
  designation?: string;
  organisation?: string;
  linkedinUrl?: string;
  photoUrl?: string;
  displayOrder?: number;
}>;

export type ProfessionalNetwork = Readonly<{
  slug: string;
  name: string;
  sourceId: string;
  linkedinUrl: string;
  description: string;
  sourceUrl: string;
  heroImage?: string;
  contactEmail?: string;
  coreTeam: readonly ProfessionalNetworkTeamMember[];
}>;

export const professionalNetworks: readonly ProfessionalNetwork[] = [
  {
    "slug": "aerospace-and-aviation",
    "name": "Aerospace and Aviation",
    "sourceId": "a2W85000000BdPREA0",
    "linkedinUrl": "https://www.linkedin.com/groups/14406677/",
    "description": "A fraternity of professionals from the Singapore's Aviation sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdPREA0/aerospace-and-aviation",
    "heroImage": "https://yayasanmendaki2--uat.sandbox.my.site.com/PNvforcesite/cms/delivery/media/MCIS3Q3EKFZRCQNK43AH2QGRN65A?channelId=0ap85000000LD0f",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007e8nEAA",
        "name": "Faris Iskandar",
        "group": "PN Lead",
        "designation": "Co-Founder",
        "organisation": "Aeroviation",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007eAPEAY",
        "name": "SFO Aidil Fahmy",
        "group": "Assistant Lead",
        "designation": "Senior First Officer",
        "organisation": "Singapore Airlines",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008VcvEAE",
        "name": "Hermizan Jumari",
        "group": "Core Team Member",
        "designation": "Deputy Director (Plans), Next Generation Programme",
        "organisation": "Civil Aviation Authority of Singapore",
        "displayOrder": 3
      },
      {
        "id": "a2X850000008VeXEAU",
        "name": "Nazri Neyat",
        "group": "Core Team Member",
        "designation": "Vice President, Ground Experience Development",
        "organisation": "Singapore Airlines",
        "displayOrder": 4
      },
      {
        "id": "a2X850000008VZiEAM",
        "name": "Syaifullah Sarip",
        "group": "Core Team Member",
        "designation": "Managing Director, APAC",
        "organisation": "Airport Dimensions",
        "displayOrder": 5
      },
      {
        "id": "a2X850000008Vg9EAE",
        "name": "Faizal Khan",
        "group": "Core Team Member",
        "designation": "Director FBO Asia",
        "organisation": "Jet Aviation",
        "displayOrder": 6
      },
      {
        "id": "a2X850000008VhlEAE",
        "name": "Este Ehara",
        "group": "Core Team Member",
        "designation": "Head, Strategic and Ecosystem Partnerships",
        "organisation": "AIR Lab, Thales",
        "displayOrder": 7
      },
      {
        "id": "a2X850000008VjNEAU",
        "name": "Masrina Abu Bakar",
        "group": "Core Team Member",
        "designation": "Senior Air Traffic Controller Instructor",
        "organisation": "Civil Aviation Authority of Singapore",
        "displayOrder": 8
      },
      {
        "id": "a2X850000008VkzEAE",
        "name": "Mohammad Haikal Zainal Abidin",
        "group": "Core Team Member",
        "designation": "Principal Engineer (Infrastructure Software)",
        "organisation": "ST Engineering Satellite System",
        "displayOrder": 9
      },
      {
        "id": "a2X850000008VmbEAE",
        "name": "Imbran Marzuki",
        "group": "Core Team Member",
        "designation": "Skills Trainer",
        "organisation": "SIA Engineering Company",
        "displayOrder": 10
      }
    ]
  },
  {
    "slug": "banking-and-finance",
    "name": "Banking & Finance",
    "sourceId": "a2W85000000BdR3EAK",
    "linkedinUrl": "https://www.linkedin.com/groups/14161777/",
    "description": "A fraternity of professionals from the Singapore's Banking and Finance sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdR3EAK/banking-and-finance",
    "heroImage": "https://yayasanmendaki2--uat.sandbox.my.site.com/PNvforcesite/cms/delivery/media/MCTPTGSNWUXND4HPRWEH5RRAP7QY?channelId=0ap85000000LD0f",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007eOvEAI",
        "name": "Sainava Bee Bee",
        "group": "PN Lead",
        "designation": "Head of Takaful Distribution, CEO Office",
        "organisation": "Etiqa Insurance Pte Ltd",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007eQXEAY",
        "name": "Muhammad Ridhwaan Radzi",
        "group": "Assistant Lead",
        "designation": "Managing Director",
        "organisation": "Islamic Finance Singapore",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008VoDEAU",
        "name": "Muhammad Fithri Daud",
        "group": "Core Team Member",
        "designation": "Director Finance",
        "organisation": "Yayasan MENDAKI",
        "displayOrder": 3
      },
      {
        "id": "a2X850000008VppEAE",
        "name": "Aisyah Fuad",
        "group": "Core Team Member",
        "designation": "Market Head SEAS, P&C Re",
        "organisation": "Swiss Re",
        "displayOrder": 4
      },
      {
        "id": "a2X850000008VrREAU",
        "name": "Sharifa Rehman Nafisa",
        "group": "Core Team Member",
        "designation": "CEO",
        "organisation": "Kingsman & Associates",
        "displayOrder": 5
      },
      {
        "id": "a2X850000008Vt3EAE",
        "name": "Abdul Wafiy",
        "group": "Core Team Member",
        "designation": "Vice President",
        "organisation": "UOB",
        "displayOrder": 6
      },
      {
        "id": "a2X850000008VufEAE",
        "name": "Zulhilmi Zainal",
        "group": "Core Team Member",
        "designation": "Assistant Relationship Manager",
        "organisation": "Bank of Singapore",
        "displayOrder": 7
      },
      {
        "id": "a2X850000008W9BEAU",
        "name": "Nana Syafiqa",
        "group": "Core Team Member",
        "designation": "Consultant",
        "organisation": "Advisor Alliance Group",
        "displayOrder": 8
      },
      {
        "id": "a2X850000008WAnEAM",
        "name": "Abdul Hadi Bohari",
        "group": "Core Team Member",
        "designation": "Operations Manager",
        "organisation": "MoneyMax Financial Services Ltd",
        "displayOrder": 9
      }
    ]
  },
  {
    "slug": "early-childhood",
    "name": "Early Childhood",
    "sourceId": "a2W85000000BdSfEAK",
    "linkedinUrl": "https://www.linkedin.com/groups/14290278/",
    "description": "A fraternity of professionals from the Singapore's Early Childhood sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdSfEAK/early-childhood",
    "heroImage": "https://yayasanmendaki2--uat.sandbox.my.site.com/PNvforcesite/cms/delivery/media/MCQ7XXQ4V47NBQ7JFOJO5FX6TXA4?channelId=0ap85000000LD0f",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007eS9EAI",
        "name": "Noretta Jacob",
        "group": "PN Lead",
        "designation": "Founder",
        "organisation": "Safar Training and Consultancy",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007eTlEAI",
        "name": "Suriati Abdolah",
        "group": "Assistant Lead",
        "designation": "Adjunct Lecturer",
        "organisation": "National Institute of Early Childhood Development",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008jftEAA",
        "name": "Azlinah Arif",
        "group": "Core Team Member",
        "designation": "Director, School Ready",
        "organisation": "Yayasan MENDAKI",
        "displayOrder": 3
      },
      {
        "id": "a2X850000008jhVEAQ",
        "name": "Nurlieja Onnawaty Mas'at",
        "group": "Core Team Member",
        "designation": "Senior Specialist",
        "organisation": "Iyad Perdaus Pte Ltd",
        "displayOrder": 4
      },
      {
        "id": "a2X850000008jj7EAA",
        "name": "Jelita Mohamed Ariffin",
        "group": "Core Team Member",
        "designation": "Professional Development and Standards",
        "organisation": "Early Childhood Development Agency",
        "displayOrder": 5
      },
      {
        "id": "a2X850000008jkjEAA",
        "name": "Imeelia Ismail",
        "group": "Core Team Member",
        "designation": "Head of Schools",
        "organisation": "Shaws Preschool Group",
        "displayOrder": 6
      },
      {
        "id": "a2X850000008jmLEAQ",
        "name": "Norami Aliza Haron",
        "group": "Core Team Member",
        "designation": "Deputy Director (Operations) (ExCEL)",
        "organisation": "National Institute of Early Childhood Development",
        "displayOrder": 7
      },
      {
        "id": "a2X850000008jnxEAA",
        "name": "Diyana Azmi",
        "group": "Core Team Member",
        "designation": "Centre Principal",
        "organisation": "Sunshine Kids Care Centre",
        "displayOrder": 8
      }
    ]
  },
  {
    "slug": "education",
    "name": "Education",
    "sourceId": "a2W85000000BdUHEA0",
    "linkedinUrl": "https://www.linkedin.com/groups/36980182/",
    "description": "A fraternity of professionals from Singapore's Education sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdUHEA0/education",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007eVNEAY",
        "name": "Muhammad Fadylla Rashiman",
        "group": "PN Lead",
        "designation": "Principal",
        "organisation": "Corporation Pirmary School",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007eWzEAI",
        "name": "Mohamed Ashiq Bin Mohamed Elias",
        "group": "Assistant Lead",
        "designation": "Vice-Principal",
        "organisation": "Greendale Secondary School",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008WCPEA2",
        "name": "Azuan Tan",
        "group": "Core Team Member",
        "designation": "Vice Principal",
        "organisation": "North Vista Primary School",
        "displayOrder": 3
      },
      {
        "id": "a2X850000008WCQEA2",
        "name": "Syed Imran Jamaluddin",
        "group": "Core Team Member",
        "designation": "Director, Learning Design and Development",
        "organisation": "Yayasan MENDAKI",
        "displayOrder": 4
      },
      {
        "id": "a2X850000008WCREA2",
        "name": "Dr Nor Hanisah Saphari",
        "group": "Core Team Member",
        "designation": "Senior Teacher, MTL Dept",
        "organisation": "Catholic Junior College",
        "displayOrder": 5
      },
      {
        "id": "a2X850000008WCSEA2",
        "name": "Nur Diana Kaswadi",
        "group": "Core Team Member",
        "designation": "Subject Head (English) and Discipline Master",
        "organisation": "Northlight School",
        "displayOrder": 6
      },
      {
        "id": "a2X850000008WCTEA2",
        "name": "Zakir Mokhtar",
        "group": "Core Team Member",
        "designation": "Vice Principal",
        "organisation": "Jiemin Primary School",
        "displayOrder": 7
      },
      {
        "id": "a2X850000008WCUEA2",
        "name": "Mohamed Sayadi Mohamed Nor",
        "group": "Core Team Member",
        "designation": "Deputy Director (Physical, Sports & Outdoor Education) Outdoor Education",
        "organisation": "Ministry of Education",
        "displayOrder": 8
      },
      {
        "id": "a2X850000008jzFEAQ",
        "name": "Abdul Ghani Mohammad Isa",
        "group": "Core Team Member",
        "designation": "Principal (Designate)",
        "organisation": "Madrasah Al-Arabiah Al-Islamiah",
        "displayOrder": 9
      },
      {
        "id": "a2X850000008k0rEAA",
        "name": "Siti Melissa Hamid",
        "group": "Core Team Member",
        "designation": "Assistant Department Head Leadership Y14",
        "organisation": "Raffles Instituition",
        "displayOrder": 10
      },
      {
        "id": "a2X850000008k2TEAQ",
        "name": "Jumali Saidi",
        "group": "Core Team Member",
        "designation": "Manager (Engineering-Mechanical Engineering)",
        "organisation": "ITE College East",
        "displayOrder": 11
      }
    ]
  },
  {
    "slug": "engineering",
    "name": "Engineering",
    "sourceId": "a2W85000000BdNqEAK",
    "linkedinUrl": "https://www.linkedin.com/groups/14237296/",
    "description": "A fraternity of professionals from the Singapore's Engineering sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdNqEAK/engineering",
    "heroImage": "https://yayasanmendaki2--uat.sandbox.my.site.com/PNvforcesite/cms/delivery/media/MCFJHKTFKCGRD6BFYBLNRW45ZNPY?channelId=0ap85000000LD0f",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007eYbEAI",
        "name": "Nurulhuda Jumahri",
        "group": "PN Lead",
        "designation": "Planning Manager",
        "organisation": "Micron Technology",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007eaDEAQ",
        "name": "Muhammad Fazli Mohd Isa",
        "group": "Assistant Lead",
        "designation": "Head of New Business",
        "organisation": "EM Engineering Pte Ltd",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008WE1EAM",
        "name": "Nurul Atiqah Dzulqarnain",
        "group": "Core Team Member",
        "designation": "Senior Research Engineer",
        "organisation": "A*Star - Advanced Remanufacturing Technology Centre",
        "displayOrder": 3
      },
      {
        "id": "a2X850000008WE2EAM",
        "name": "Rafii Ahmad",
        "group": "Core Team Member",
        "designation": "Senior Manager (Operations S2T)",
        "organisation": "Singapore LNG Corporation",
        "displayOrder": 4
      },
      {
        "id": "a2X850000008WE3EAM",
        "name": "Abdul Naufal",
        "group": "Core Team Member",
        "designation": "Project Manager",
        "organisation": "Land Transport Authority (LTA)",
        "displayOrder": 5
      },
      {
        "id": "a2X850000008WE4EAM",
        "name": "Wan Nur Sabrina",
        "group": "Core Team Member",
        "designation": "Assistant Manager, Robotics Engineer",
        "organisation": "National University Health System (NUHS)",
        "displayOrder": 6
      },
      {
        "id": "a2X850000008WE5EAM",
        "name": "Syahidin Isa",
        "group": "Core Team Member",
        "designation": "Senior Lead Designer",
        "organisation": "Exyte",
        "displayOrder": 7
      },
      {
        "id": "a2X850000008WE6EAM",
        "name": "Hannan Yeo",
        "group": "Core Team Member",
        "designation": "Project Manager",
        "organisation": "A*Star - Institute of Microelectronics",
        "displayOrder": 8
      },
      {
        "id": "a2X850000008WE7EAM",
        "name": "Siti Mariam",
        "group": "Core Team Member",
        "designation": "Data Analytics Manager – Business Partner, Supply Chain",
        "organisation": "Institute of Microelectronics",
        "displayOrder": 9
      },
      {
        "id": "a2X850000008WE8EAM",
        "name": "Mohamed Shuhail",
        "group": "Core Team Member",
        "designation": "Occupational Health and Safety Manager",
        "organisation": "BDx Data Centers",
        "displayOrder": 10
      }
    ]
  },
  {
    "slug": "entrepreneurship",
    "name": "Entrepreneurship",
    "sourceId": "a2W85000000BdVtEAK",
    "linkedinUrl": "https://www.linkedin.com/groups/23250004/",
    "description": "A fraternity of professionals from Singapore's Entrepreneurship sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdVtEAK/entrepreneurship",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007ebpEAA",
        "name": "Muhammad Shamir Abdul Rahim",
        "group": "PN Lead",
        "designation": "Tech Founder & Data Architect",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007edREAQ",
        "name": "Mustaffa Kamal",
        "group": "Assistant Lead",
        "designation": "Co-Founder and CEO",
        "organisation": "Black Hole Group",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008WFdEAM",
        "name": "Shaik Nifael Nazeemuddin",
        "group": "Core Team Member",
        "designation": "Managing Director",
        "organisation": "Jetters Incz",
        "displayOrder": 3
      },
      {
        "id": "a2X850000008WFeEAM",
        "name": "Haikkel Firdaus",
        "group": "Core Team Member",
        "designation": "Founder",
        "organisation": "SGFR Store",
        "displayOrder": 4
      },
      {
        "id": "a2X850000008WFfEAM",
        "name": "Murtaza Topiwalla",
        "group": "Core Team Member",
        "designation": "Co-Founder",
        "organisation": "Sodainmind",
        "displayOrder": 5
      },
      {
        "id": "a2X850000008WFgEAM",
        "name": "Fathurrahman Faizal",
        "group": "Core Team Member",
        "designation": "Co-Founder",
        "organisation": "Ranger Labs",
        "displayOrder": 6
      },
      {
        "id": "a2X850000008WFhEAM",
        "name": "Muhammed Sadiq",
        "group": "Core Team Member",
        "designation": "Managing Director",
        "organisation": "Onpoint Consulting",
        "displayOrder": 7
      },
      {
        "id": "a2X850000008WFiEAM",
        "name": "Nadhrah Alhadi",
        "group": "Core Team Member",
        "designation": "Managing Director",
        "organisation": "AMGD Global and Reta Social Enterprise",
        "displayOrder": 8
      },
      {
        "id": "a2X850000008WFjEAM",
        "name": "Miza Nazili",
        "group": "Core Team Member",
        "designation": "Founder and CEO",
        "organisation": "ShortCutx",
        "displayOrder": 9
      },
      {
        "id": "a2X850000008WFkEAM",
        "name": "Haryani Othman",
        "group": "Core Team Member",
        "designation": "Managing Director",
        "organisation": "MakBesar Pte Ltd",
        "displayOrder": 10
      },
    ]
  },
  {
    "slug": "healthcare",
    "name": "Healthcare",
    "sourceId": "a2W85000000BdXVEA0",
    "linkedinUrl": "https://www.linkedin.com/groups/14276878/",
    "description": "A fraternity of professionals from the Singapore's Healthcare sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdXVEA0/healthcare",
    "heroImage": "https://yayasanmendaki2--uat.sandbox.my.site.com/PNvforcesite/cms/delivery/media/MCS3HX4YTG2BE2REWI257LTU2WF4?channelId=0ap85000000LD0f",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007eLhEAI",
        "name": "Dr Suraya Zainul Abidin",
        "group": "PN Lead",
        "designation": "Consultant Orthopaedic Surgeon",
        "organisation": "Singapore General Hospital",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007eNJEAY",
        "name": "Muhammad Rahizan Zainuldin",
        "group": "Assistant Lead",
        "designation": "Associate Professor",
        "organisation": "Singapore Institute of Technology",
        "displayOrder": 2
      },
      {
        "id": "a2X850000007eC1EAI",
        "name": "Zakiah Sidek",
        "group": "Core Team Member",
        "designation": "Senior Radiographer",
        "organisation": "Singapore General Hospital",
        "displayOrder": 3
      },
      {
        "id": "a2X850000007eDdEAI",
        "name": "Dr Siti Sarina Mohd Sairazi",
        "group": "Core Team Member",
        "designation": "Family Physician",
        "organisation": "Shifa Clinic",
        "displayOrder": 4
      },
      {
        "id": "a2X850000007eFFEAY",
        "name": "Nani Adilla Zailani",
        "group": "Core Team Member",
        "designation": "Senior Occupational Therapist",
        "organisation": "Tan Tock Seng Hospital",
        "displayOrder": 5
      },
      {
        "id": "a2X850000007eGrEAI",
        "name": "Muhammad Nifail Zainal",
        "group": "Core Team Member",
        "designation": "Principal Physiotherapist",
        "organisation": "Crawfurd Hospital",
        "displayOrder": 6
      },
      {
        "id": "a2X850000007eITEAY",
        "name": "Dr Juriyah Yatim",
        "group": "Core Team Member",
        "designation": "Assistant Director, Nursing & Advanced P",
        "organisation": "Singapore General Hospital",
        "displayOrder": 7
      },
      {
        "id": "a2X850000007eK5EAI",
        "name": "Farhana Md Rafik",
        "group": "Core Team Member",
        "designation": "Embryologist",
        "organisation": "KKH",
        "displayOrder": 8
      },
    ]
  },
  {
    "slug": "human-resources",
    "name": "Human Resources",
    "sourceId": "a2W85000000BdZ7EAK",
    "linkedinUrl": "https://www.linkedin.com/groups/14289305/",
    "description": "A fraternity of professionals from the Singapore's Human Resource sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdZ7EAK/human-resources",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007ef3EAA",
        "name": "Khairilanwar Baharudin",
        "group": "PN Lead",
        "designation": "APAC HR Leader",
        "organisation": "Gemini",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007egfEAA",
        "name": "Azrina Mansor",
        "group": "Assistant Lead",
        "designation": "Deputy Director, APAC Talent Acquisition",
        "organisation": "GlobalFoundries",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008WHFEA2",
        "name": "Dr Noraslinda Zuber",
        "group": "Core Team Member",
        "designation": "Deputy Chief Executive Officer",
        "organisation": "Yayasan MENDAKI",
        "displayOrder": 3
      },
      {
        "id": "a2X850000008WHGEA2",
        "name": "Helmi Ali",
        "group": "Core Team Member",
        "designation": "Director",
        "organisation": "Hyan Consulting",
        "displayOrder": 4
      },
      {
        "id": "a2X850000008WHHEA2",
        "name": "Nur Jana Ismail @ Jana Edwards",
        "group": "Core Team Member",
        "designation": "Senior Human Resources Manager",
        "organisation": "Kexim Global (Singapore)",
        "displayOrder": 5
      },
      {
        "id": "a2X850000008WHIEA2",
        "name": "Adam Basor",
        "group": "Core Team Member",
        "designation": "Adjunct Faculty Leader",
        "organisation": "CIEE Council on International Educational Exchange",
        "displayOrder": 6
      },
      {
        "id": "a2X850000008WHJEA2",
        "name": "Leesa Abdullah",
        "group": "Core Team Member",
        "designation": "Immigration Manager",
        "organisation": "Santa Fe Relocation",
        "displayOrder": 7
      },
      {
        "id": "a2X850000008WHKEA2",
        "name": "Wan Khairulnizam",
        "group": "Core Team Member",
        "designation": "Global Capabilities Program Manager",
        "organisation": "The Coca-Cola Company",
        "displayOrder": 8
      },
      {
        "id": "a2X850000008WHLEA2",
        "name": "Fairuz Aziz",
        "group": "Core Team Member",
        "designation": "Talent Acquisition Manager",
        "organisation": "National University Hospital",
        "displayOrder": 9
      }
    ]
  },
  {
    "slug": "legal",
    "name": "Legal",
    "sourceId": "a2W85000000BdajEAC",
    "linkedinUrl": "https://www.linkedin.com/groups/14249872/",
    "description": "A fraternity of professionals from the Singapore's Legal sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdajEAC/legal",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000008W5xEAE",
        "name": "Imran Rahim",
        "group": "PN Lead",
        "designation": "Director Gateway Law Corporation",
        "displayOrder": 1
      },
      {
        "id": "a2X850000008VGMEA2",
        "name": "Istyana Putri Ibrahim",
        "group": "Assistant Lead",
        "designation": "Acting Director, Maintenance Enforcement Division",
        "organisation": "Ministry of Law",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008VwHEAU",
        "name": "Adzfar Alami",
        "group": "Core Team Member",
        "designation": "Partner",
        "organisation": "Rajah & Tann",
        "displayOrder": 3
      },
      {
        "id": "a2X850000008VwIEAU",
        "name": "Natasha Sulaiman",
        "group": "Core Team Member",
        "designation": "VP Legal and Compliance",
        "organisation": "Singapore Airlines",
        "displayOrder": 4
      },
      {
        "id": "a2X850000008VwJEAU",
        "name": "Liyana Sinwan",
        "group": "Core Team Member",
        "designation": "Senior Associate",
        "organisation": "K&L Gates Straits Law",
        "displayOrder": 5
      },
      {
        "id": "a2X850000008VwKEAU",
        "name": "Eusuff Ali",
        "group": "Core Team Member",
        "designation": "Director",
        "organisation": "Peter Low Chambers",
        "displayOrder": 6
      },
      {
        "id": "a2X850000008VwLEAU",
        "name": "Syukrina Salam",
        "group": "Core Team Member",
        "designation": "Community Lawyer",
        "organisation": "Pro Bono SG",
        "displayOrder": 7
      },
      {
        "id": "a2X850000008VwMEAU",
        "name": "Kamal Ashraf",
        "group": "Core Team Member",
        "displayOrder": 8
      }
    ]
  },
  {
    "slug": "life-sciences",
    "name": "Life Sciences",
    "sourceId": "a2W85000000BdcLEAS",
    "linkedinUrl": "https://www.linkedin.com/groups/14115620/",
    "description": "A fraternity of professionals from the Singapore's Biopharmaceutical & Sciences sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdcLEAS/life-sciences",
    "heroImage": "https://yayasanmendaki2--uat.sandbox.my.site.com/PNvforcesite/cms/delivery/media/MCGYBFEMPBWJFAPIDPU3DWLRMLFA?channelId=0ap85000000LD0f",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007elVEAQ",
        "name": "Dr Norham Erlyani Abdul Hamid",
        "group": "PN Lead",
        "designation": "Head of Strategy and Public Relations of Hilleman Laboratories.",
        "organisation": "Hilleman Laboratories",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007en7EAA",
        "name": "Dr Desiree Abdurrachim",
        "group": "Assistant Lead",
        "designation": "Principal Scientist",
        "organisation": "MSD Singapore",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008WKTEA2",
        "name": "Dr Muhammad Nadzim Ramli",
        "group": "Core Team Member",
        "designation": "Senior Scientist",
        "organisation": "MSD Singapore",
        "displayOrder": 3
      },
      {
        "id": "a2X850000008WKUEA2",
        "name": "Dr Esdy Rozali",
        "group": "Core Team Member",
        "designation": "Medical Manager & Medical Information Lead",
        "organisation": "Novartis",
        "displayOrder": 4
      },
      {
        "id": "a2X850000008WKVEA2",
        "name": "Dr Rabia'tul A'dawiah Mohamed Yazid",
        "group": "Core Team Member",
        "designation": "Research Fellow Manager",
        "organisation": "NHG Health",
        "displayOrder": 5
      }
    ]
  },
  {
    "slug": "media-and-creatives",
    "name": "Media & Creatives",
    "sourceId": "a2W85000000BddxEAC",
    "linkedinUrl": "https://www.linkedin.com/groups/14284323/",
    "description": "A fraternity of professionals from the Singapore's Media and Creatives sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BddxEAC/media-and-creatives",
    "heroImage": "https://yayasanmendaki2--uat.sandbox.my.site.com/PNvforcesite/cms/delivery/media/MCRJZ2KIBANJC4ZK6TC3KNIRNQ3M?channelId=0ap85000000LD0f",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007f3FEAQ",
        "name": "Hatta Aziz",
        "group": "PN Lead",
        "designation": "Managing Director",
        "organisation": "Geo Growth",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007f4rEAA",
        "name": "Norhaiza Binte Hashim",
        "group": "Assistant Lead",
        "designation": "Audience and Growth Editor",
        "organisation": "Berita Harian",
        "displayOrder": 2
      },
      {
        "id": "a2X850000007f6TEAQ",
        "name": "Noor Azhar Mohamed",
        "group": "Core Team Member",
        "designation": "Founder and CEO",
        "organisation": "Opera Academy Singapore",
        "displayOrder": 3
      },
      {
        "id": "a2X850000007f85EAA",
        "name": "Nazreen Daud",
        "group": "Core Team Member",
        "designation": "Founder and Digital Chief",
        "organisation": "Roquepress",
        "displayOrder": 4
      },
      {
        "id": "a2X850000007f9hEAA",
        "name": "Nazrana Zainuddin",
        "group": "Core Team Member",
        "designation": "Director, Comms",
        "organisation": "MENDAKI",
        "displayOrder": 5
      },
      {
        "id": "a2X850000007fBJEAY",
        "name": "Muhammad Izwan Ohtman",
        "group": "Core Team Member",
        "designation": "Senior Editor - Presenter",
        "organisation": "Mediacorp"
      },
      {
        "id": "a2X850000007fCvEAI",
        "name": "Aidli Mohamed Salleh, Mosbit",
        "group": "Core Team Member",
        "designation": "Senior Lecturer, Centre for Transcultural Studies, International Relations",
        "organisation": "Temasek Polytechnic"
      }
    ]
  },
  {
    "slug": "public-sector",
    "name": "Public Sector",
    "sourceId": "a2W85000000BdfZEAS",
    "linkedinUrl": "https://www.linkedin.com/groups/14288321/",
    "description": "A fraternity of professionals from the Singapore's Public Sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdfZEAS/public-sector",
    "heroImage": "https://yayasanmendaki2--uat.sandbox.my.site.com/PNvforcesite/cms/delivery/media/MCMNGXBRUKBBCDHDM4QPKES3PDIY?channelId=0ap85000000LD0f",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007etZEAQ",
        "name": "COL Muhammad Helmi Khaswan",
        "group": "PN Lead",
        "designation": "Director Policy-Ops",
        "organisation": "Ministry of Defence",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007duIEAQ",
        "name": "Iva Aminuddin",
        "group": "Assistant Lead",
        "designation": "Director, Capability and Organisation De",
        "organisation": "CPF Academy",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008WM5EAM",
        "name": "Faridah Saad",
        "group": "Core Team Member",
        "designation": "Deputy Director, Global Markets Strategy & Policy, Enterprise Singapore",
        "displayOrder": 3
      },
      {
        "id": "a2X850000008WM6EAM",
        "name": "Fadzli Baharom Adzahar",
        "group": "Core Team Member",
        "designation": "Director (Policy and Transformation), One Mosque Sector, Majlis Ugama Islam Singapura",
        "displayOrder": 4
      },
      {
        "id": "a2X850000008WM7EAM",
        "name": "Danial Hakim",
        "group": "Core Team Member",
        "displayOrder": 5
      },
      {
        "id": "a2X850000008WM8EAM",
        "name": "Syafiq Suhaini",
        "group": "Core Team Member",
        "designation": "Senior Assistant Director, Ministry of Trade and Information",
        "displayOrder": 6
      },
      {
        "id": "a2X850000008WM9EAM",
        "name": "Muhammad Izzuddin Amirruddin",
        "group": "Core Team Member",
        "designation": "Commanding Officer, Singapore Armed Forces",
        "displayOrder": 7
      },
      {
        "id": "a2X850000008WMAEA2",
        "name": "Siti Nuraidah",
        "group": "Core Team Member",
        "designation": "Deputy Director, Transformation, National Council for Social Service",
        "displayOrder": 8
      },
      {
        "id": "a2X850000008WMBEA2",
        "name": "Hafizah Beevi",
        "group": "Core Team Member",
        "designation": "Manager, Literary Arts, National Arts Council",
        "displayOrder": 9
      },
      {
        "id": "a2X850000008WMCEA2",
        "name": "Syasya Nur",
        "group": "Core Team Member",
        "designation": "Manager, Comlink Regional Services, Ministry of Social and Family Development",
        "displayOrder": 10
      }
    ]
  },
  {
    "slug": "social-services",
    "name": "Social Services",
    "sourceId": "a2W85000000BdhBEAS",
    "linkedinUrl": "https://www.linkedin.com/groups/14284320/",
    "description": "A fraternity of professionals from the Singapore's Social Services sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdhBEAS/social-services",
    "heroImage": "https://yayasanmendaki2--uat.sandbox.my.site.com/PNvforcesite/cms/delivery/media/MCFEQAAD4YWZGXHEQVXPAVYIFHZY?channelId=0ap85000000LD0f",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007fEXEAY",
        "name": "Zahara Mahmood",
        "group": "PN Lead",
        "designation": "Principal Social Worker",
        "organisation": "As-Salaam PPIS",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007fG9EAI",
        "name": "Nurrauhdah Ridzuan Ajma'in",
        "group": "Assistant Lead",
        "designation": "Assistant Director, People Development & Culture, Family & Community Support Divison",
        "organisation": "Allkin Singapore Ltd.",
        "displayOrder": 2
      },
      {
        "id": "a2X850000007fJNEAY",
        "name": "Siti Nurzakiah Zar'an",
        "group": "Core Team Member",
        "designation": "Senior Medical Social Worker",
        "organisation": "KK Women's and Children Hospital"
      },
      {
        "id": "a2X850000007fKzEAI",
        "name": "Saiful Nizam Jemain",
        "group": "Core Team Member",
        "designation": "Acting Deputy Head, Community Care | Principal Social Worker",
        "organisation": "The National Kidney Foundation"
      },
      {
        "id": "a2X850000007fMbEAI",
        "name": "Nurhuda Yusoff",
        "group": "Core Team Member",
        "designation": "Team Lead",
        "organisation": "Allkin Singapore Ltd."
      },
      {
        "id": "a2X850000007ef5EAA",
        "name": "Nur Ezrina Elias",
        "group": "Core Team Member",
        "designation": "Deputy CEO",
        "organisation": "MENDAKI"
      },
      {
        "id": "a2X850000007fODEAY",
        "name": "Norriyanah Omar",
        "group": "Core Team Member",
        "designation": "Assistant Director, Community Corrections Work Release Scheme",
        "organisation": "Singapore Prison Service"
      },
      {
        "id": "a2X850000007fHlEAI",
        "name": "Siti Mariam Mohd Salim",
        "group": "Core Team Member",
        "designation": "Principal Therapist and Art Therapist",
        "organisation": "Private Space Medical Pte Ltd"
      }
    ]
  },
  {
    "slug": "sports",
    "name": "Sports",
    "sourceId": "a2W85000000BdinEAC",
    "linkedinUrl": "https://www.linkedin.com/groups/14288285/",
    "description": "A fraternity of professionals from Singapore's Sports sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdinEAC/sports",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007eqLEAQ",
        "name": "Muhammad Shakir Bin Juanda",
        "group": "PN Lead",
        "designation": "Senior Manager",
        "organisation": "SpexSG",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007erxEAA",
        "name": "Hariss Harun",
        "group": "Assistant Lead",
        "designation": "National Team Captain",
        "organisation": "Football Association of Singapore",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008k5hEAA",
        "name": "Ervika Trinny Kamarol Zaman",
        "group": "Core Team Member",
        "designation": "National Athlete",
        "organisation": "Jiu Jitsu",
        "displayOrder": 3
      },
      {
        "id": "a2X850000008k7JEAQ",
        "name": "Marah Ishraf",
        "group": "Core Team Member",
        "designation": "National Athlete",
        "organisation": "Rugby",
        "displayOrder": 4
      },
      {
        "id": "a2X850000008k8vEAA",
        "name": "Muhammad Syazni Ramlee",
        "group": "Core Team Member",
        "designation": "Interim Head Coach",
        "organisation": "Singapore Men’s Floorball Team",
        "displayOrder": 5
      },
      {
        "id": "a2X850000008kAXEAY",
        "name": "Fairuz Bin Mohamed",
        "group": "Core Team Member",
        "designation": "CEO",
        "organisation": "Combats Sports Centre",
        "displayOrder": 6
      },
      {
        "id": "a2X850000008kC9EAI",
        "name": "Abdul Rashid Aziz",
        "group": "Core Team Member",
        "designation": "Senior Technical Staff for Physiology",
        "organisation": "Singapore Sport Institute",
        "displayOrder": 7
      },
      {
        "id": "a2X850000008jxeEAA",
        "name": "Nur Aqilah Afiqah Binte Andin Agustino Saman",
        "group": "Core Team Member",
        "designation": "Former National Athlete",
        "organisation": "Netball",
        "displayOrder": 8
      }
    ]
  },
  {
    "slug": "sustainability",
    "name": "Sustainability",
    "sourceId": "a2W85000000BdkPEAS",
    "linkedinUrl": "https://www.linkedin.com/groups/14287266/",
    "description": "A fraternity of professionals from the Singapore's Sustainability sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdkPEAS/sustainability",
    "heroImage": "https://yayasanmendaki2--uat.sandbox.my.site.com/PNvforcesite/cms/delivery/media/MC6JEB6YZMZFBEDCUCDNJ76GGOCY?channelId=0ap85000000LD0f",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007evBEAQ",
        "name": "Muhammad Ibnur Rashad bin Zainal Abidin",
        "group": "PN Lead",
        "designation": "Chief Foresight Officer",
        "organisation": "GUILD Asia",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007ef4EAA",
        "name": "Safafisalam Bohari Jaon",
        "group": "Assistant Lead",
        "designation": "Senior Associate - Decision Modelling &",
        "organisation": "EY-Parthenon",
        "displayOrder": 2
      },
      {
        "id": "a2X850000007ewnEAA",
        "name": "Nuryanee Anisah",
        "group": "Core Team Member",
        "designation": "Student/Entrepenuer",
        "organisation": "Commonhers"
      },
      {
        "id": "a2X850000007eyPEAQ",
        "name": "Nur Khairiana Mohamad Malek",
        "group": "Core Team Member",
        "designation": "Deputy Director / CUGE (Manpower Develop",
        "organisation": "National Parks Board"
      },
      {
        "id": "a2X850000007f01EAA",
        "name": "Luqman Akasyah",
        "group": "Core Team Member",
        "designation": "Strategic Projects, Group COO Office",
        "organisation": "Sembcorp Industries Ltd"
      },
      {
        "id": "a2X850000007eK6EAI",
        "name": "Attiya Ashraf Ali",
        "group": "Core Team Member",
        "designation": "Manager, Climate Change and Sustainabili",
        "organisation": "EY"
      },
      {
        "id": "a2X850000007f1dEAA",
        "name": "Faris Ridzuan",
        "group": "Core Team Member",
        "designation": "Educator"
      },
      {
        "id": "a2X850000007eQYEAY",
        "name": "Khairul Rejal",
        "group": "Core Team Member",
        "designation": "Partner",
        "organisation": "Investible"
      }
    ]
  },
  {
    "slug": "tech",
    "name": "Tech",
    "sourceId": "a2W85000000Bdm1EAC",
    "linkedinUrl": "https://www.linkedin.com/groups/14502157/",
    "description": "A fraternity of professionals from the Singapore's Tech sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    "sourceUrl": "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000Bdm1EAC/tech",
    "heroImage": "https://yayasanmendaki2--uat.sandbox.my.site.com/PNvforcesite/cms/delivery/media/MC55JJYC4WDREXTK2JUWMNXGEXNA?channelId=0ap85000000LD0f",
    "contactEmail": "professionalnetworks@mendaki.org.sg",
    "coreTeam": [
      {
        "id": "a2X850000007eDeEAI",
        "name": "Liyana Fauzi",
        "group": "PN Lead",
        "designation": "Deputy Director, Product Management",
        "organisation": "GovTech",
        "displayOrder": 1
      },
      {
        "id": "a2X850000007eojEAA",
        "name": "Luqman Lukman",
        "group": "Assistant Lead",
        "designation": "Senior Software Engineer",
        "organisation": "Airwallex",
        "displayOrder": 2
      },
      {
        "id": "a2X850000008WNhEAM",
        "name": "Muhammad Izhar Abdul Rahman",
        "group": "Core Team Member",
        "designation": "Manager",
        "organisation": "Online Safety Commission"
      },
      {
        "id": "a2X850000008WNiEAM",
        "name": "Muhammad Zahari Abu Talib",
        "group": "Core Team Member",
        "designation": "Assistant Director",
        "organisation": "Ministry of Digital Development and Information"
      },
      {
        "id": "a2X850000008WNjEAM",
        "name": "Izzat Noor",
        "group": "Core Team Member",
        "designation": "Cyber Threat Intelligence Specialist, VP",
        "organisation": "BNY"
      },
      {
        "id": "a2X850000008WNkEAM",
        "name": "Hayati Hamzah",
        "group": "Core Team Member",
        "designation": "Senior Data Operation Engineer",
        "organisation": "MB Energy"
      },
      {
        "id": "a2X850000008WNlEAM",
        "name": "Muhammad Azfar Ramli",
        "group": "Core Team Member",
        "designation": "Deputy Department Director, Systems Science",
        "organisation": "A*STAR - IAIC"
      },
      {
        "id": "a2X850000008WNmEAM",
        "name": "Ridzwan Mustafah",
        "group": "Core Team Member",
        "designation": "Head of Applications Engineering, APAC",
        "organisation": "Universal Robots"
      },
      {
        "id": "a2X850000008WNnEAM",
        "name": "Marianah Kasmin",
        "group": "Core Team Member",
        "designation": "Technology Business Partner",
        "organisation": "Boeing"
      },
    ]
  }
] as const;

export function getProfessionalNetwork(slug: string): ProfessionalNetwork | undefined {
  return professionalNetworks.find((network) => network.slug === slug);
}
